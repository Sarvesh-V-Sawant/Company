import mongoose from 'mongoose';
import { toZonedTime } from 'date-fns-tz';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { Regularization } from '@models/Regularization';
import { AttendanceDay } from '@models/AttendanceDay';
import { AttendanceSession } from '@models/AttendanceSession';
import { CompanySettings } from '@models/CompanySettings';
import { PayrollRecord } from '@models/PayrollRecord';
import { AuditLog } from '@models/AuditLog';
import { User } from '@models/User';
import { NotificationService } from '@services/NotificationService';
import { computeDayStatus } from '@engines/DayStatusEngine';
import type { IRegularization } from '@models/Regularization';
import type { ICompanySettings } from '@models/CompanySettings';
import type { CreateRegularizationInput, RegularizationListQuery } from '@validators/regularization';
import type { JwtPayload } from '@app-types/jwt';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatReg(reg: IRegularization & { _id: mongoose.Types.ObjectId }) {
  return {
    id:                reg._id.toHexString(),
    employeeId:        reg.employeeId.toHexString(),
    dateString:        reg.dateString,
    type:              reg.type,
    requestedCheckIn:  reg.requestedCheckIn?.toISOString() ?? null,
    requestedCheckOut: reg.requestedCheckOut?.toISOString() ?? null,
    reason:            reg.reason,
    status:            reg.status,
    reviewedBy:        reg.reviewedBy?.toHexString() ?? null,
    reviewedAt:        reg.reviewedAt?.toISOString() ?? null,
    reviewRemark:      reg.reviewRemark ?? null,
    attendanceDayId:   reg.attendanceDayId?.toHexString() ?? null,
    withdrawnAt:       reg.withdrawnAt?.toISOString() ?? null,
    createdAt:         reg.createdAt.toISOString(),
  };
}

async function getSettings(): Promise<ICompanySettings> {
  const s = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
  if (!s) throw new AppError('GEN_004', 500, 'Company settings not configured.');
  return s;
}

async function checkPayrollWarning(
  employeeId: mongoose.Types.ObjectId,
  dateString: string,
): Promise<string | null> {
  const yearMonth = dateString.slice(0, 7);
  const record = await PayrollRecord.findOne({ employeeId, yearMonth, status: 'finalised' }).lean();
  return record ? `Payroll for ${yearMonth} is already finalised. Attendance change may affect payroll accuracy.` : null;
}

// ─── M2: Date boundary validation ────────────────────────────────────────────

function localDateString(ts: Date, timezone: string): string {
  return toZonedTime(ts, timezone).toISOString().slice(0, 10);
}

function validateTimestampBoundaries(
  dateStr: string,
  requestedCheckIn: Date | undefined,
  requestedCheckOut: Date | undefined,
  timezone: string,
): void {
  if (requestedCheckIn) {
    const localDay = localDateString(requestedCheckIn, timezone);
    if (localDay !== dateStr) {
      throw new AppError('GEN_001', 400, `requestedCheckIn must be on the same calendar day as date (${dateStr}) in the company timezone.`);
    }
  }

  if (requestedCheckOut) {
    const localDay = localDateString(requestedCheckOut, timezone);
    const reqDate  = new Date(dateStr + 'T00:00:00Z');
    const nextDay  = new Date(reqDate.getTime() + 86_400_000).toISOString().slice(0, 10);
    if (localDay !== dateStr && localDay !== nextDay) {
      throw new AppError('GEN_001', 400, `requestedCheckOut must be on the same day or the following day as date (${dateStr}) in the company timezone.`);
    }
  }
}

// ─── Reconciliation helpers ───────────────────────────────────────────────────

async function reconcileForSession(
  employeeId: mongoose.Types.ObjectId,
  dateString: string,
  attendanceDayId: mongoose.Types.ObjectId,
  settings: ICompanySettings,
  session: mongoose.ClientSession,
) {
  // Sum durationMinutes from all closed sessions for this employee+date
  const sessions = await AttendanceSession.find(
    { employeeId, dateString, isActive: false },
    { durationMinutes: 1 },
  ).session(session).lean();
  const totalMinutes = sessions.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);

  const result = computeDayStatus({
    totalMinutes,
    requiredDailyMinutes:    settings.requiredDailyMinutes,
    halfDayThresholdMinutes: settings.halfDayThresholdMinutes,
    halfDayLateCheckInTime:  settings.halfDayLateCheckInTime,
    lateArrivalGraceMinutes: settings.lateArrivalGraceMinutes,
    workStartTime:           settings.workStartTime,
  });

  await AttendanceDay.findByIdAndUpdate(
    attendanceDayId,
    {
      $set: {
        status:          result.finalStatus,
        totalMinutes,
        overtimeMinutes: Math.max(0, totalMinutes - settings.requiredDailyMinutes),
        isLateArrival:   result.isLateArrival,
        lateByMinutes:   result.lateByMinutes,
        isHalfDayCapped: result.isHalfDayCapped,
        isRegularized:   true,
      },
    },
    { session },
  );

  return result.finalStatus;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class RegularizationService {

  // ─── Create ──────────────────────────────────────────────────────────────────

  static async create(params: {
    employeeId: string;
    input: CreateRegularizationInput;
  }) {
    await connectDB();
    const settings = await getSettings();

    const { employeeId, input } = params;
    const employeeOid = new mongoose.Types.ObjectId(employeeId);

    // BR-REG-01: date must not be future or today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const reqDate = new Date(input.date + 'T00:00:00Z');
    if (reqDate >= today) {
      throw new AppError('GEN_001', 400, 'Date must be in the past.');
    }

    // BR-REG-01: within lookback window
    const lookbackMs = settings.regularizationLookbackDays * 24 * 60 * 60 * 1000;
    if (today.getTime() - reqDate.getTime() > lookbackMs) {
      throw new AppError('REG_001', 422, `Date is older than the allowed lookback window of ${settings.regularizationLookbackDays} days.`);
    }

    // M2: Validate requestedCheckIn/requestedCheckOut date boundaries
    validateTimestampBoundaries(
      input.date,
      input.requestedCheckIn  ? new Date(input.requestedCheckIn)  : undefined,
      input.requestedCheckOut ? new Date(input.requestedCheckOut) : undefined,
      settings.timezone,
    );

    // BR-REG-02: no active (pending/approved) request for this date
    const existing = await Regularization.findOne({
      employeeId: employeeOid,
      dateString: input.date,
      status: { $in: ['pending', 'approved'] },
    }).lean();
    if (existing) {
      throw new AppError('REG_002', 409, 'A regularization request already exists for this date.');
    }

    const reg = await Regularization.create({
      employeeId:        employeeOid,
      dateString:        input.date,
      type:              input.type,
      requestedCheckIn:  input.requestedCheckIn  ? new Date(input.requestedCheckIn)  : undefined,
      requestedCheckOut: input.requestedCheckOut ? new Date(input.requestedCheckOut) : undefined,
      reason:            input.reason,
      status:            'pending',
    });

    await AuditLog.create({
      performedBy: employeeOid,
      action:      'REGULARIZATION_CREATED',
      targetType:  'Regularization',
      targetId:    reg._id.toHexString(),
    });

    void NotificationService.notifyAllAdmins({
      type:          'regularizationSubmitted',
      title:         'New Regularization Request',
      body:          `An employee has submitted an attendance regularization request for ${input.date}.`,
      referenceType: 'regularizationRequest',
      referenceId:   reg._id as mongoose.Types.ObjectId,
    });

    return formatReg(reg as IRegularization & { _id: mongoose.Types.ObjectId });
  }

  // ─── Approve ─────────────────────────────────────────────────────────────────

  static async approve(id: string, adminId: string) {
    await connectDB();
    const settings = await getSettings();

    const reg = await Regularization.findById(id).lean() as (IRegularization & { _id: mongoose.Types.ObjectId }) | null;
    if (!reg) throw new AppError('GEN_002', 404, 'Regularization request not found.');
    if (reg.status !== 'pending') throw new AppError('REG_003', 422, 'Only pending requests can be approved.');

    const adminOid    = new mongoose.Types.ObjectId(adminId);
    const employeeOid = reg.employeeId;
    const { dateString } = reg;
    const dateObj = new Date(dateString + 'T00:00:00Z');
    const year  = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth() + 1;

    const warnings: string[] = [];
    const payrollWarn = await checkPayrollWarning(employeeOid, dateString);
    if (payrollWarn) warnings.push(payrollWarn);

    const dbSession = await mongoose.startSession();
    let updatedDayStatus: string = 'present';
    let attendanceDayId: mongoose.Types.ObjectId;

    try {
      await dbSession.withTransaction(async () => {
        // ── Upsert AttendanceDay ────────────────────────────────────────────
        const dayUpsert = await AttendanceDay.findOneAndUpdate(
          { employeeId: employeeOid, dateString },
          {
            $setOnInsert: {
              employeeId:      employeeOid,
              dateString,
              date:            dateObj,
              year,
              month,
              totalMinutes:    0,
              requiredMinutes: settings.requiredDailyMinutes,
              overtimeMinutes: 0,
              isLateArrival:   false,
              lateByMinutes:   0,
              isHalfDayCapped: false,
              isRegularized:   false,
            },
          },
          { upsert: true, new: true, session: dbSession },
        );
        attendanceDayId = dayUpsert!._id as mongoose.Types.ObjectId;

        if (reg.type === 'forgotCheckIn') {
          // Create synthetic session (closed — past date, no real checkout)
          const nonce = `sys-reg-${reg._id.toHexString().slice(-8)}`;
          const checkInTs = reg.requestedCheckIn ?? dateObj;

          await AttendanceSession.create(
            [{
              employeeId:      employeeOid,
              attendanceDayId,
              dateString,
              checkIn: {
                timestamp:          checkInTs,
                latitude:           0,
                longitude:          0,
                accuracy:           0,
                distanceFromOffice: 0,
                deviceFingerprint:  'system-regularization',
                nonce,
                isWithinGeoFence:   true,
              },
              checkOut:          null,
              durationMinutes:   null,
              isActive:          false,
              closedBySystem:    true,
              systemCloseReason: 'admin-force-close' as const,
              flags: {
                lowGpsAccuracy:      false,
                outsideGeoFence:     false,
                suspiciousTimestamp: false,
                possibleMockGps:     false,
              },
            }],
            { session: dbSession },
          );

          // Day forced to present — no checkout means duration=0, status engine would mark absent
          await AttendanceDay.findByIdAndUpdate(
            attendanceDayId,
            {
              $set: {
                status:                  'present',
                isRegularized:           true,
                regularizationRequestId: reg._id,
              },
            },
            { session: dbSession },
          );
          updatedDayStatus = 'present';

        } else if (reg.type === 'forgotCheckOut') {
          // H1 FIX: Find session that is either still active (unlikely for past days)
          // OR was closed by midnight-rollover cron (the normal case for past dates).
          // Active sessions would only exist on same-day regularizations (unlikely but handled).
          const targetSession = await AttendanceSession.findOne(
            {
              employeeId: employeeOid,
              dateString,
              $or: [
                { isActive: true },
                { isActive: false, closedBySystem: true, systemCloseReason: 'midnight-rollover' },
              ],
            },
          ).sort({ createdAt: -1 }).session(dbSession).lean();

          if (!targetSession) {
            throw new AppError('REG_006', 422, 'No session found for forgot-checkout regularization. No active or midnight-rolled session exists for this date.');
          }

          const checkOutTs   = reg.requestedCheckOut ?? new Date();
          const checkInTs    = targetSession.checkIn.timestamp;
          const durationMins = Math.max(0, Math.round((checkOutTs.getTime() - checkInTs.getTime()) / 60000));

          await AttendanceSession.findByIdAndUpdate(
            targetSession._id,
            {
              $set: {
                isActive:          false,
                closedBySystem:    true,
                systemCloseReason: 'admin-force-close' as const,
                durationMinutes:   durationMins,
                checkOut: {
                  timestamp:          checkOutTs,
                  nonce:              `sys-reg-co-${reg._id.toHexString().slice(-8)}`,
                  latitude:           0,
                  longitude:          0,
                  accuracy:           0,
                  distanceFromOffice: 0,
                  deviceFingerprint:  'system-regularization',
                  isWithinGeoFence:   true,
                },
              },
            },
            { session: dbSession },
          );

          updatedDayStatus = await reconcileForSession(employeeOid, dateString, attendanceDayId, settings, dbSession);
          await AttendanceDay.findByIdAndUpdate(
            attendanceDayId,
            { $set: { regularizationRequestId: reg._id } },
            { session: dbSession },
          );

        } else {
          // workAwayFromOffice | officialTravel | clientVisit
          // Directly mark day as present — no session creation per BR-REG-07
          await AttendanceDay.findByIdAndUpdate(
            attendanceDayId,
            {
              $set: {
                status:                  'present',
                isRegularized:           true,
                regularizationRequestId: reg._id,
              },
            },
            { session: dbSession },
          );
          updatedDayStatus = 'present';
        }

        // ── Update regularization status ─────────────────────────────────
        await Regularization.findByIdAndUpdate(
          reg._id,
          {
            $set: {
              status:         'approved',
              reviewedBy:     adminOid,
              reviewedAt:     new Date(),
              attendanceDayId,
            },
          },
          { session: dbSession },
        );
      });
    } finally {
      await dbSession.endSession();
    }

    await AuditLog.create({
      performedBy: adminOid,
      action:      'REGULARIZATION_APPROVED',
      targetType:  'Regularization',
      targetId:    id,
    });

    void (async () => {
      const regUser = await User.findById(reg.employeeId, 'email firstName lastName').lean() as { email: string; firstName: string; lastName: string } | null;
      void NotificationService.create({
        employeeId:    reg.employeeId,
        type:          'regularizationApproved',
        title:         'Regularization Request Approved',
        body:          `Your attendance regularization request for ${reg.dateString} has been approved.`,
        referenceType: 'regularizationRequest',
        referenceId:   reg._id,
        emailAddress:  regUser?.email,
        emailName:     regUser ? `${regUser.firstName} ${regUser.lastName}` : undefined,
      });
    })();

    return {
      id,
      status:          'approved',
      attendanceDayId: attendanceDayId!.toHexString(),
      updatedDayStatus,
      warnings,
    };
  }

  // ─── Reject ───────────────────────────────────────────────────────────────────

  static async reject(id: string, adminId: string, reason?: string) {
    await connectDB();

    const reg = await Regularization.findById(id).lean() as (IRegularization & { _id: mongoose.Types.ObjectId }) | null;
    if (!reg) throw new AppError('GEN_002', 404, 'Regularization request not found.');
    if (reg.status !== 'pending') throw new AppError('REG_003', 422, 'Only pending requests can be rejected.');

    const adminOid = new mongoose.Types.ObjectId(adminId);

    await Regularization.findByIdAndUpdate(id, {
      $set: {
        status:       'rejected',
        reviewedBy:   adminOid,
        reviewedAt:   new Date(),
        reviewRemark: reason,
      },
    });

    await AuditLog.create({
      performedBy: adminOid,
      action:      'REGULARIZATION_REJECTED',
      targetType:  'Regularization',
      targetId:    id,
    });

    void (async () => {
      const regUser = await User.findById(reg.employeeId, 'email firstName lastName').lean() as { email: string; firstName: string; lastName: string } | null;
      void NotificationService.create({
        employeeId:    reg.employeeId,
        type:          'regularizationRejected',
        title:         'Regularization Request Rejected',
        body:          `Your attendance regularization request for ${reg.dateString} has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
        referenceType: 'regularizationRequest',
        referenceId:   reg._id,
        emailAddress:  regUser?.email,
        emailName:     regUser ? `${regUser.firstName} ${regUser.lastName}` : undefined,
      });
    })();

    return { id, status: 'rejected' };
  }

  // ─── Withdraw ─────────────────────────────────────────────────────────────────

  static async withdraw(id: string, employeeId: string) {
    await connectDB();

    const employeeOid = new mongoose.Types.ObjectId(employeeId);
    const reg = await Regularization.findById(id).lean() as (IRegularization & { _id: mongoose.Types.ObjectId }) | null;
    if (!reg) throw new AppError('GEN_002', 404, 'Regularization request not found.');
    if (!reg.employeeId.equals(employeeOid)) throw new AppError('AUTH_006', 403, 'Not authorized to withdraw this request.');
    if (reg.status !== 'pending') throw new AppError('REG_003', 422, 'Only pending requests can be withdrawn.');

    await Regularization.findByIdAndUpdate(id, {
      $set: { status: 'withdrawn', withdrawnAt: new Date() },
    });

    await AuditLog.create({
      performedBy: employeeOid,
      action:      'REGULARIZATION_WITHDRAWN',
      targetType:  'Regularization',
      targetId:    id,
    });

    return { id, status: 'withdrawn' };
  }

  // ─── Get by ID ────────────────────────────────────────────────────────────────

  static async getById(id: string, payload: JwtPayload) {
    await connectDB();

    const reg = await Regularization.findById(id).lean() as (IRegularization & { _id: mongoose.Types.ObjectId }) | null;
    if (!reg) throw new AppError('GEN_002', 404, 'Regularization request not found.');

    if (payload.role === 'employee') {
      const employeeOid = new mongoose.Types.ObjectId(payload.userId);
      if (!reg.employeeId.equals(employeeOid)) {
        throw new AppError('AUTH_006', 403, 'Not authorized to view this request.');
      }
    }

    return formatReg(reg);
  }

  // ─── List ─────────────────────────────────────────────────────────────────────

  static async list(query: RegularizationListQuery, payload: JwtPayload) {
    await connectDB();

    const filter: Record<string, unknown> = {};

    if (payload.role === 'employee') {
      filter.employeeId = new mongoose.Types.ObjectId(payload.userId);
    } else if (query.employeeId) {
      filter.employeeId = new mongoose.Types.ObjectId(query.employeeId);
    }

    if (query.status) filter.status = query.status;
    if (query.startDate || query.endDate) {
      const range: Record<string, string> = {};
      if (query.startDate) range.$gte = query.startDate;
      if (query.endDate)   range.$lte = query.endDate;
      filter.dateString = range;
    }

    const skip = (query.page - 1) * query.limit;
    const [regs, total] = await Promise.all([
      Regularization.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean() as unknown as Promise<(IRegularization & { _id: mongoose.Types.ObjectId })[]>,
      Regularization.countDocuments(filter),
    ]);

    return {
      data:       regs.map(formatReg),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  // ─── List Pending (admin) ─────────────────────────────────────────────────────

  static async listPending(query: { page: number; limit: number }) {
    await connectDB();

    const skip = (query.page - 1) * query.limit;
    const [regs, total] = await Promise.all([
      Regularization.find({ status: 'pending' }).sort({ createdAt: 1 }).skip(skip).limit(query.limit).lean() as unknown as Promise<(IRegularization & { _id: mongoose.Types.ObjectId })[]>,
      Regularization.countDocuments({ status: 'pending' }),
    ]);

    return {
      data:       regs.map(formatReg),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }
}
