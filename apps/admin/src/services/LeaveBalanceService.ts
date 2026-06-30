import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { getLeaveYearBoundaries } from '@lib/utils/leaveUtils';
import { User } from '@models/User';
import { CompanySettings } from '@models/CompanySettings';
import { LeaveYearAllocation } from '@models/LeaveYearAllocation';
import { LeaveTransaction } from '@models/LeaveTransaction';
import type { ICompanySettings, ILeaveTypeConfig } from '@models/CompanySettings';
import type { IProRationBasis } from '@models/LeaveYearAllocation';
import type { IUser, ILeaveTypeBalance } from '@models/User';

type LeaveTypeName = 'paidLeave' | 'sickLeave' | 'casualLeave';
const LEAVE_TYPES: LeaveTypeName[] = ['paidLeave', 'sickLeave', 'casualLeave'];

// ─── Leave Year Allocation ────────────────────────────────────────────────────

export class LeaveBalanceService {

  static async allocateLeaveYear(leaveYear: number): Promise<{ allocated: number; skipped: number }> {
    await connectDB();

    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    if (!settings) throw new Error('Company settings not configured.');

    const leaveYearStartMonth = settings.leaveYearStartMonth ?? 1;
    const leaveYearStart = new Date(Date.UTC(leaveYear, leaveYearStartMonth - 1, 1));

    const employees = await User.find({ isActive: true }, '_id dateOfJoining leaveBalances').lean() as unknown as IUser[];

    let allocated = 0;
    let skipped   = 0;

    for (const emp of employees) {
      for (const leaveType of LEAVE_TYPES) {
        const config: ILeaveTypeConfig | undefined = settings.leaveTypes?.[leaveType];
        if (!config) continue;

        const annualAlloc = config.annualAllocation ?? 0;

        // Pro-ration check: did employee join after the leave year started?
        const joinDate    = emp.dateOfJoining ? new Date(emp.dateOfJoining) : null;
        const isProRated  = joinDate ? joinDate > leaveYearStart : false;

        let allocatedDays = annualAlloc;
        let proRationBasis: IProRationBasis | undefined;

        if (isProRated && joinDate) {
          const leaveYearBoundaries = getLeaveYearBoundaries(leaveYearStart, leaveYearStartMonth);
          const totalMs     = leaveYearBoundaries.end.getTime() - leaveYearBoundaries.start.getTime();
          const eligibleMs  = leaveYearBoundaries.end.getTime() - joinDate.getTime();
          const totalDays   = Math.round(totalMs   / 86_400_000);
          const eligibleDays = Math.max(0, Math.round(eligibleMs / 86_400_000));
          allocatedDays = totalDays > 0
            ? Math.floor((annualAlloc * eligibleDays) / totalDays)
            : 0;
          proRationBasis = {
            joinDate,
            leaveYearStart: leaveYearBoundaries.start,
            totalWorkingDays:    totalDays,
            eligibleWorkingDays: eligibleDays,
          };
        }

        const mongoSession = await mongoose.startSession();
        try {
          await mongoSession.withTransaction(async () => {
            // Unique index prevents double allocation (idempotency guard at DB level)
            try {
              await LeaveYearAllocation.create([{
                employeeId:    emp._id,
                leaveYear,
                leaveType,
                allocatedDays,
                isProRated,
                proRationBasis,
                allocatedAt:   new Date(),
                allocatedBy:   'system-cron',
              }], { session: mongoSession });
            } catch (err: unknown) {
              // Unique constraint: already allocated — skip
              if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
                skipped++;
                return;
              }
              throw err;
            }

            // Credit to currentYear balance
            const balBefore = (emp.leaveBalances?.[leaveType] as ILeaveTypeBalance) ?? { currentYear: 0, carriedForward: 0 };
            const balAfterCy = balBefore.currentYear + allocatedDays;

            await User.findByIdAndUpdate(
              emp._id,
              { $inc: { [`leaveBalances.${leaveType}.currentYear`]: allocatedDays } },
              { session: mongoSession },
            );

            await LeaveTransaction.create([{
              employeeId:  emp._id,
              leaveType,
              leaveYear,
              transactionType: isProRated ? 'pro-rated-allocation' : 'annual-allocation',
              days:   allocatedDays,
              balanceAfterCurrentYear:    balAfterCy,
              balanceAfterCarriedForward: balBefore.carriedForward,
              referenceType: 'leaveYearAllocation',
              performedBy:   'system-cron',
              timestamp:     new Date(),
            }], { session: mongoSession });

            allocated++;
          });
        } finally {
          await mongoSession.endSession();
        }
      }
    }

    return { allocated, skipped };
  }

  // ─── Carry-Forward Expiry ───────────────────────────────────────────────────

  static async processCarryForwardExpiry(dateString: string): Promise<{ processed: number }> {
    await connectDB();

    const cutoff = new Date(dateString + 'T00:00:00Z');
    let processed = 0;

    const employees = await User.find(
      {
        isActive: true,
        $or: LEAVE_TYPES.map(lt => ({
          [`leaveBalances.${lt}.carriedForward`]: { $gt: 0 },
          [`leaveBalances.${lt}.carryForwardExpiry`]: { $lte: cutoff },
        })),
      },
      '_id leaveBalances',
    ).lean() as unknown as IUser[];

    for (const emp of employees) {
      for (const leaveType of LEAVE_TYPES) {
        const bal = emp.leaveBalances?.[leaveType] as ILeaveTypeBalance | undefined;
        if (!bal || bal.carriedForward <= 0) continue;
        if (!bal.carryForwardExpiry || bal.carryForwardExpiry > cutoff) continue;

        const expiredDays = bal.carriedForward;

        const mongoSession = await mongoose.startSession();
        try {
          await mongoSession.withTransaction(async () => {
            await User.findByIdAndUpdate(
              emp._id,
              { $set: { [`leaveBalances.${leaveType}.carriedForward`]: 0 } },
              { session: mongoSession },
            );

            const leaveYear = new Date(dateString).getFullYear();
            await LeaveTransaction.create([{
              employeeId:  emp._id,
              leaveType,
              leaveYear,
              transactionType: 'carry-forward-expiry',
              days:   -expiredDays,
              balanceAfterCurrentYear:    bal.currentYear,
              balanceAfterCarriedForward: 0,
              performedBy:   'system-cron',
              timestamp:     new Date(),
            }], { session: mongoSession });

            processed++;
          });
        } finally {
          await mongoSession.endSession();
        }
      }
    }

    return { processed };
  }

  // ─── Carry-Forward Credit (year-end) ────────────────────────────────────────

  static async creditCarryForward(
    fromLeaveYear: number,
    toLeaveYear: number,
    settings: ICompanySettings,
  ): Promise<{ credited: number }> {
    await connectDB();

    const leaveYearStartMonth = settings.leaveYearStartMonth ?? 1;
    const newYearStart = new Date(Date.UTC(toLeaveYear, leaveYearStartMonth - 1, 1));
    let credited = 0;

    const employees = await User.find({ isActive: true }, '_id leaveBalances').lean() as unknown as IUser[];

    for (const emp of employees) {
      for (const leaveType of LEAVE_TYPES) {
        const config: ILeaveTypeConfig | undefined = settings.leaveTypes?.[leaveType];
        if (!config?.carryForward?.enabled) continue;

        const bal = emp.leaveBalances?.[leaveType] as ILeaveTypeBalance | undefined;
        if (!bal) continue;

        const carryDays = Math.min(bal.currentYear, config.carryForward.maxDays ?? 0);
        if (carryDays <= 0) continue;

        const expiryMonths = config.carryForward.expiryMonths ?? 3;
        const expiryDate   = new Date(Date.UTC(newYearStart.getUTCFullYear(), newYearStart.getUTCMonth() + expiryMonths, 0));

        const mongoSession = await mongoose.startSession();
        try {
          await mongoSession.withTransaction(async () => {
            await User.findByIdAndUpdate(
              emp._id,
              {
                $inc: { [`leaveBalances.${leaveType}.carriedForward`]: carryDays },
                $set: { [`leaveBalances.${leaveType}.carryForwardExpiry`]: expiryDate },
              },
              { session: mongoSession },
            );

            await LeaveTransaction.create([{
              employeeId:  emp._id,
              leaveType,
              leaveYear:   toLeaveYear,
              transactionType: 'carry-forward-credit',
              days:   carryDays,
              balanceAfterCurrentYear:    bal.currentYear,
              balanceAfterCarriedForward: (bal.carriedForward ?? 0) + carryDays,
              performedBy:   'system-cron',
              timestamp:     new Date(),
            }], { session: mongoSession });

            credited++;
          });
        } finally {
          await mongoSession.endSession();
        }
      }
    }

    return { credited };
  }
}
