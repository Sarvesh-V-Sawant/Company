import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { getCurrentMonthIST } from '@lib/utils/date-ist';
import { getWorkingDaysBetween } from '@lib/utils/leaveUtils';
import { computePayroll } from '@engines/PayrollEngine';
import { AppError } from '@services/AuthService';
import { Employee } from '@models/Employee';
import { User } from '@models/User';
import { CompanySettings } from '@models/CompanySettings';
import { AttendanceDay } from '@models/AttendanceDay';
import { Holiday } from '@models/Holiday';
import { PayrollRecord } from '@models/PayrollRecord';
import { AuditLog } from '@models/AuditLog';
import { NotificationService } from '@services/NotificationService';
import type { IPayrollRecord, IEmployeeSnapshot } from '@models/PayrollRecord';
import type { IEmployee } from '@models/Employee';
import type { IUser } from '@models/User';
import type { ICompanySettings } from '@models/CompanySettings';
import type { PayrollListQuery, PayrollMeQuery } from '@validators/payroll';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRecord(r: IPayrollRecord & { _id: mongoose.Types.ObjectId }) {
  return {
    id:                    r._id.toHexString(),
    yearMonth:             r.yearMonth,
    status:                r.status,
    employeeSnapshot:      r.employeeSnapshot,
    effectiveWorkingDays:  r.effectiveWorkingDays,
    effectivePresentDays:  r.effectivePresentDays,
    halfDays:              r.halfDays,
    effectiveLwpDays:      r.effectiveLwpDays,
    halfDayLwpDays:        r.halfDayLwpDays,
    paidLeaveDays:         r.paidLeaveDays,
    absentDays:            r.absentDays,
    grossSalary:           r.grossSalary,
    perDaySalary:          r.perDaySalary,
    deductionBreakdown:    r.deductionBreakdown,
    manualDeduction:       r.manualDeduction,
    manualDeductionRemark: r.manualDeductionRemark,
    netSalary:             r.netSalary,
    computedAt:            r.computedAt.toISOString(),
    finalisedAt:           r.finalisedAt?.toISOString() ?? null,
  };
}

function yearMonthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function lastDayOf(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

async function computeForEmployee(params: {
  employeeOid: mongoose.Types.ObjectId;
  yearMonth:   string;
  settings:    ICompanySettings;
  actorId:     string;
}): Promise<ReturnType<typeof formatRecord>> {
  const { employeeOid, yearMonth, settings, actorId } = params;

  const employee = await Employee.findById(employeeOid).lean() as unknown as (IEmployee & { _id: mongoose.Types.ObjectId }) | null;
  if (!employee) throw new AppError('GEN_002', 404, 'Employee not found.');

  const user = await User.findById(employee.userId).lean() as unknown as (IUser & { _id: mongoose.Types.ObjectId }) | null;
  if (!user) throw new AppError('GEN_002', 404, 'Employee user record not found.');

  // BR-PAY-02: block recompute if finalised
  const existing = await PayrollRecord.findOne({ employeeId: employeeOid, yearMonth }).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
  if (existing?.status === 'finalised') {
    throw new AppError('PAY_001', 409, 'Payroll already finalised for this employee and month.');
  }

  // Effective date range for this employee (BR-PAY-05)
  const [yr, mo] = yearMonth.split('-').map(Number);
  const monthStartUTC = new Date(Date.UTC(yr, mo - 1, 1));
  const monthEndUTC   = new Date(Date.UTC(yr, mo, 0));

  const joiningUTC = new Date(Date.UTC(
    employee.joiningDate.getUTCFullYear(),
    employee.joiningDate.getUTCMonth(),
    employee.joiningDate.getUTCDate(),
  ));

  const effectiveStart = joiningUTC > monthStartUTC ? joiningUTC : monthStartUTC;
  let effectiveEnd = monthEndUTC;
  if (user.dateOfLeaving) {
    const leavingUTC = new Date(Date.UTC(
      user.dateOfLeaving.getUTCFullYear(),
      user.dateOfLeaving.getUTCMonth(),
      user.dateOfLeaving.getUTCDate(),
    ));
    if (leavingUTC < effectiveEnd) effectiveEnd = leavingUTC;
  }

  // Holidays in the month for working-days calculation
  const firstDay = `${yearMonth}-01`;
  const lastDay  = lastDayOf(yearMonth);
  const holidays = await Holiday.find({ dateString: { $gte: firstDay, $lte: lastDay } }).lean();
  const holidayDates = (holidays as Array<{ dateString: string }>).map((h) => h.dateString);

  const effectiveWorkingDays = getWorkingDaysBetween(
    effectiveStart, effectiveEnd, settings.workingDays, holidayDates,
  );

  // Attendance aggregation for the month
  const attendanceDays = await AttendanceDay.find({ employeeId: employeeOid, year: yr, month: mo }).lean();

  let presentFull = 0, halfDays = 0, halfDayLwpDays = 0, lwpFull = 0, paidLeaveDays = 0, absentDays = 0;
  for (const day of attendanceDays as Array<{ status: string; leaveType?: string }>) {
    switch (day.status) {
      case 'present':  presentFull++;  break;
      case 'half-day':
        halfDays++;
        if (day.leaveType === 'lwp') halfDayLwpDays++;
        break;
      case 'lwp':    lwpFull++;       break;
      case 'leave':  paidLeaveDays++; break;
      case 'absent': absentDays++;    break;
    }
  }

  const effectiveLwpDays     = lwpFull + halfDayLwpDays * 0.5;
  const effectivePresentDays = presentFull + halfDays * 0.5;
  const manualDeduction      = existing?.manualDeduction ?? 0;
  const manualDeductionRemark = existing?.manualDeductionRemark ?? '';

  const engineResult = computePayroll({
    grossSalary:          employee.monthlySalary,
    effectiveWorkingDays,
    effectiveLwpDays,
    absentDays,
    manualDeduction,
  });

  const snapshot: IEmployeeSnapshot = {
    firstName:     employee.firstName,
    lastName:      employee.lastName,
    employeeId:    employee.employeeCode,
    department:    employee.department,
    designation:   employee.designation,
    monthlySalary: employee.monthlySalary,
  };

  const dbSession = await mongoose.startSession();
  let record!: IPayrollRecord & { _id: mongoose.Types.ObjectId };
  try {
    await dbSession.withTransaction(async () => {
      const updated = await PayrollRecord.findOneAndUpdate(
        { employeeId: employeeOid, yearMonth },
        {
          $set: {
            status:               'draft',
            employeeSnapshot:     snapshot,
            effectiveWorkingDays,
            effectivePresentDays,
            halfDays,
            effectiveLwpDays,
            halfDayLwpDays,
            paidLeaveDays,
            absentDays,
            grossSalary:         employee.monthlySalary,
            perDaySalary:        engineResult.perDaySalary,
            deductionBreakdown: {
              lwpDeduction:    engineResult.lwpDeduction,
              absentDeduction: engineResult.absentDeduction,
              manualDeduction,
              totalDeductions: engineResult.totalDeductions,
            },
            manualDeduction,
            manualDeductionRemark,
            netSalary:  engineResult.netSalary,
            computedAt: new Date(),
          },
          $unset: { finalisedAt: 1 },
        },
        { upsert: true, new: true, session: dbSession },
      ).lean() as unknown as IPayrollRecord & { _id: mongoose.Types.ObjectId };
      record = updated;

      await AuditLog.create([{
        performedBy: new mongoose.Types.ObjectId(actorId),
        action:      'PAYROLL_COMPUTED',
        targetType:  'PayrollRecord',
        targetId:    record._id,
      }], { session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }

  return formatRecord(record);
}

// ─── PayrollService ───────────────────────────────────────────────────────────

export class PayrollService {

  static async compute(params: { yearMonth: string; employeeId?: string; actorId: string }) {
    await connectDB();

    const currentYearMonth = getCurrentMonthIST();
    if (params.yearMonth > currentYearMonth) {
      throw new AppError('GEN_001', 400, 'Cannot compute payroll for a future month.');
    }

    const settings = await CompanySettings.findById('company-settings').lean() as unknown as ICompanySettings | null;
    if (!settings) throw new AppError('GEN_004', 500, 'Company settings not configured.');

    if (params.employeeId) {
      const employeeOid = new mongoose.Types.ObjectId(params.employeeId);
      const employee = await Employee.findById(employeeOid).lean() as unknown as (IEmployee & { _id: mongoose.Types.ObjectId }) | null;
      if (!employee) throw new AppError('GEN_002', 404, 'Employee not found.');
      return computeForEmployee({ employeeOid, yearMonth: params.yearMonth, settings, actorId: params.actorId });
    }

    // Bulk — all active employees in batches of 10
    const employees = await Employee.find({ status: 'active' }).lean() as unknown as Array<IEmployee & { _id: mongoose.Types.ObjectId }>;
    let computed = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < employees.length; i += 10) {
      const batch = employees.slice(i, i + 10);
      const settled = await Promise.allSettled(
        batch.map((emp) => computeForEmployee({ employeeOid: emp._id, yearMonth: params.yearMonth, settings, actorId: params.actorId }))
      );
      for (let j = 0; j < settled.length; j++) {
        const r = settled[j];
        if (r.status === 'fulfilled') {
          computed++;
        } else {
          const err = r.reason as Error;
          if (err instanceof AppError && err.code === 'PAY_001') {
            skipped++;
          } else {
            errors.push(`${batch[j].employeeCode}: ${err.message}`);
          }
        }
      }
    }

    return { computed, skipped, errors, yearMonth: params.yearMonth };
  }

  static async finalise(params: { employeeId: string; yearMonth: string; adminId: string }) {
    await connectDB();
    const employeeOid = new mongoose.Types.ObjectId(params.employeeId);

    const existing = await PayrollRecord.findOne({ employeeId: employeeOid, yearMonth: params.yearMonth }).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
    if (!existing) throw new AppError('PAY_002', 404, 'Payroll record not found.');
    if (existing.status === 'finalised') throw new AppError('PAY_001', 409, 'Payroll already finalised.');

    const now = new Date();
    const dbSession = await mongoose.startSession();
    let record!: IPayrollRecord & { _id: mongoose.Types.ObjectId };
    try {
      await dbSession.withTransaction(async () => {
        const updated = await PayrollRecord.findOneAndUpdate(
          { employeeId: employeeOid, yearMonth: params.yearMonth, status: 'draft' },
          { $set: { status: 'finalised', finalisedAt: now } },
          { new: true, session: dbSession },
        ).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
        if (!updated) throw new AppError('PAY_001', 409, 'Payroll already finalised.');
        record = updated;

        await AuditLog.create([{
          performedBy: new mongoose.Types.ObjectId(params.adminId),
          action:      'PAYROLL_FINALISED',
          targetType:  'PayrollRecord',
          targetId:    record._id,
        }], { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    // Notify employee their payroll has been finalised (fire-and-forget)
    void (async () => {
      const employee = await Employee.findOne({ _id: employeeOid }, 'userId').lean() as { userId: mongoose.Types.ObjectId } | null;
      if (employee) {
        const empUser = await User.findById(employee.userId, 'email firstName lastName').lean() as { email: string; firstName: string; lastName: string } | null;
        void NotificationService.create({
          employeeId:    employee.userId,
          type:          'payrollGenerated',
          title:         'Payroll Finalised',
          body:          `Your payroll for ${params.yearMonth} has been finalised.`,
          referenceType: 'payrollSummary',
          referenceId:   record._id,
          emailAddress:  empUser?.email,
          emailName:     empUser ? `${empUser.firstName} ${empUser.lastName}` : undefined,
        });
      }
    })();

    return {
      id:          record._id.toHexString(),
      status:      'finalised' as const,
      finalisedAt: record.finalisedAt?.toISOString() ?? now.toISOString(),
      finalisedBy: params.adminId,
    };
  }

  static async unfinalise(params: { employeeId: string; yearMonth: string; adminId: string; reason: string }) {
    await connectDB();
    const employeeOid = new mongoose.Types.ObjectId(params.employeeId);

    const existing = await PayrollRecord.findOne({ employeeId: employeeOid, yearMonth: params.yearMonth }).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
    if (!existing) throw new AppError('PAY_002', 404, 'Payroll record not found.');
    if (existing.status === 'draft') throw new AppError('PAY_004', 409, 'Payroll is not finalised.');

    const now = new Date();
    const dbSession = await mongoose.startSession();
    let recordId!: mongoose.Types.ObjectId;
    try {
      await dbSession.withTransaction(async () => {
        const updated = await PayrollRecord.findOneAndUpdate(
          { employeeId: employeeOid, yearMonth: params.yearMonth, status: 'finalised' },
          { $set: { status: 'draft' }, $unset: { finalisedAt: 1 } },
          { new: true, session: dbSession },
        ).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
        if (!updated) throw new AppError('PAY_004', 409, 'Payroll is not finalised.');
        recordId = updated._id;

        await AuditLog.create([{
          performedBy: new mongoose.Types.ObjectId(params.adminId),
          action:      'PAYROLL_UNFINALISED',
          targetType:  'PayrollRecord',
          targetId:    recordId,
          meta:        { reason: params.reason },
        }], { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    return {
      id:            recordId.toHexString(),
      status:        'draft' as const,
      unfinalisedAt: now.toISOString(),
      unfinalisedBy: params.adminId,
    };
  }

  static async getByEmployeeMonth(params: { employeeId: string; yearMonth: string }) {
    await connectDB();
    const employeeOid = new mongoose.Types.ObjectId(params.employeeId);
    const record = await PayrollRecord.findOne({ employeeId: employeeOid, yearMonth: params.yearMonth }).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
    if (!record) throw new AppError('PAY_002', 404, 'Payroll record not found.');
    return formatRecord(record);
  }

  static async listAdmin(query: PayrollListQuery) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (query.yearMonth)  filter.yearMonth  = query.yearMonth;
    if (query.status)     filter.status     = query.status;
    if (query.employeeId) filter.employeeId = new mongoose.Types.ObjectId(query.employeeId);

    const skip = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      PayrollRecord.find(filter).sort({ yearMonth: -1, 'employeeSnapshot.firstName': 1 }).skip(skip).limit(query.limit).lean() as unknown as Promise<Array<IPayrollRecord & { _id: mongoose.Types.ObjectId }>>,
      PayrollRecord.countDocuments(filter),
    ]);

    return {
      data: docs.map(formatRecord),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  static async listForEmployee(params: { userId: string; query: PayrollMeQuery }) {
    await connectDB();
    const userOid    = new mongoose.Types.ObjectId(params.userId);
    const employee   = await Employee.findOne({ userId: userOid }).lean() as unknown as (IEmployee & { _id: mongoose.Types.ObjectId }) | null;
    if (!employee) throw new AppError('GEN_002', 404, 'Employee record not found.');

    const joiningYM = yearMonthOf(employee.joiningDate);
    const filter: Record<string, unknown> = { employeeId: employee._id, yearMonth: { $gte: joiningYM } };
    if (params.query.yearMonth) {
      if (params.query.yearMonth < joiningYM) {
        throw new AppError('AUTH_006', 403, 'Payroll not available for months before joining date.');
      }
      filter.yearMonth = params.query.yearMonth;
    }

    const skip = (params.query.page - 1) * params.query.limit;
    const [docs, total] = await Promise.all([
      PayrollRecord.find(filter).sort({ yearMonth: -1 }).skip(skip).limit(params.query.limit).lean() as unknown as Promise<Array<IPayrollRecord & { _id: mongoose.Types.ObjectId }>>,
      PayrollRecord.countDocuments(filter),
    ]);

    return {
      data: docs.map(formatRecord),
      pagination: { page: params.query.page, limit: params.query.limit, total, totalPages: Math.ceil(total / params.query.limit) },
    };
  }

  static async getOwnByYearMonth(params: { userId: string; yearMonth: string }) {
    await connectDB();
    const userOid  = new mongoose.Types.ObjectId(params.userId);
    const employee = await Employee.findOne({ userId: userOid }).lean() as unknown as (IEmployee & { _id: mongoose.Types.ObjectId }) | null;
    if (!employee) throw new AppError('GEN_002', 404, 'Employee record not found.');

    const joiningYM = yearMonthOf(employee.joiningDate);
    if (params.yearMonth < joiningYM) {
      throw new AppError('AUTH_006', 403, 'Payroll not available for months before joining date.');
    }

    const record = await PayrollRecord.findOne({ employeeId: employee._id, yearMonth: params.yearMonth }).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
    if (!record) throw new AppError('PAY_002', 404, 'Payroll record not found.');
    return formatRecord(record);
  }

  static async adjust(params: {
    employeeId:      string;
    yearMonth:       string;
    manualDeduction: number;
    remark:          string;
    adminId:         string;
  }) {
    await connectDB();
    const employeeOid = new mongoose.Types.ObjectId(params.employeeId);

    const existing = await PayrollRecord.findOne({ employeeId: employeeOid, yearMonth: params.yearMonth }).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
    if (!existing) throw new AppError('PAY_002', 404, 'Payroll record not found.');
    if (existing.status === 'finalised') throw new AppError('PAY_001', 409, 'Cannot adjust a finalised payroll.');

    const engineResult = computePayroll({
      grossSalary:          existing.grossSalary,
      effectiveWorkingDays: existing.effectiveWorkingDays,
      effectiveLwpDays:     existing.effectiveLwpDays,
      absentDays:           existing.absentDays,
      manualDeduction:      params.manualDeduction,
    });

    const record = await PayrollRecord.findOneAndUpdate(
      { employeeId: employeeOid, yearMonth: params.yearMonth },
      {
        $set: {
          manualDeduction:                      params.manualDeduction,
          manualDeductionRemark:                params.remark,
          'deductionBreakdown.manualDeduction': params.manualDeduction,
          'deductionBreakdown.totalDeductions': engineResult.totalDeductions,
          netSalary:                            engineResult.netSalary,
        },
      },
      { new: true },
    ).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
    if (!record) throw new AppError('PAY_002', 404, 'Payroll record not found.');

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(params.adminId),
      action:      'PAYROLL_ADJUSTED',
      targetType:  'PayrollRecord',
      targetId:    record._id,
    });

    return {
      id:                    record._id.toHexString(),
      yearMonth:             record.yearMonth,
      status:                record.status,
      manualDeduction:       record.manualDeduction,
      manualDeductionRemark: record.manualDeductionRemark,
      deductionBreakdown:    record.deductionBreakdown,
      netSalary:             record.netSalary,
    };
  }

  // Resolves a payroll record ObjectId → { employeeId, yearMonth } for routes that
  // now receive the payroll record's own id (not the employee's id).
  private static async resolveRecord(id: string): Promise<{ employeeId: string; yearMonth: string }> {
    const oid = new mongoose.Types.ObjectId(id);
    const r = await PayrollRecord.findById(oid, { employeeId: 1, yearMonth: 1 }).lean() as unknown as { employeeId: mongoose.Types.ObjectId; yearMonth: string } | null;
    if (!r) throw new AppError('PAY_002', 404, 'Payroll record not found.');
    return { employeeId: r.employeeId.toHexString(), yearMonth: r.yearMonth };
  }

  static async getByRecordId(id: string) {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(id);
    const record = await PayrollRecord.findById(oid).lean() as unknown as (IPayrollRecord & { _id: mongoose.Types.ObjectId }) | null;
    if (!record) throw new AppError('PAY_002', 404, 'Payroll record not found.');
    return formatRecord(record);
  }

  static async finaliseByRecordId(params: { recordId: string; adminId: string }) {
    await connectDB();
    const { employeeId, yearMonth } = await PayrollService.resolveRecord(params.recordId);
    return PayrollService.finalise({ employeeId, yearMonth, adminId: params.adminId });
  }

  static async unfinaliseByRecordId(params: { recordId: string; adminId: string; reason: string }) {
    await connectDB();
    const { employeeId, yearMonth } = await PayrollService.resolveRecord(params.recordId);
    return PayrollService.unfinalise({ employeeId, yearMonth, adminId: params.adminId, reason: params.reason });
  }

  static async adjustByRecordId(params: { recordId: string; manualDeduction: number; remark: string; adminId: string }) {
    await connectDB();
    const { employeeId, yearMonth } = await PayrollService.resolveRecord(params.recordId);
    return PayrollService.adjust({ employeeId, yearMonth, manualDeduction: params.manualDeduction, remark: params.remark, adminId: params.adminId });
  }
}
