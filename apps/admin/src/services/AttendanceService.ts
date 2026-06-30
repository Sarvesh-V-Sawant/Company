import mongoose from 'mongoose';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { connectDB } from '@lib/db/connect';
import { sha256 } from '@lib/utils/hash';
import { haversineMeters } from '@engines/GeoFenceEngine';
import { computeDayStatus } from '@engines/DayStatusEngine';
import { User } from '@models/User';
import { CompanySettings } from '@models/CompanySettings';
import { AttendanceDay } from '@models/AttendanceDay';
import { AttendanceSession } from '@models/AttendanceSession';
import { UsedNonce } from '@models/UsedNonce';
import { Holiday } from '@models/Holiday';
import { AuditLog } from '@models/AuditLog';
import { AppError } from '@services/AuthService';
import type { ICompanySettings } from '@models/CompanySettings';
import type { IAttendanceDay, AttendanceDayStatus } from '@models/AttendanceDay';
import type { WeekDay } from '@app-types/enums';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMongooseDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
}

function toLocalDateString(utcDate: Date, timezone: string): string {
  return formatInTimeZone(utcDate, timezone, 'yyyy-MM-dd');
}

function toLocalHHMM(utcDate: Date, timezone: string): string {
  return formatInTimeZone(utcDate, timezone, 'HH:mm');
}

function toLocalDayOfWeek(utcDate: Date, timezone: string): WeekDay {
  return formatInTimeZone(utcDate, timezone, 'EEEE').toLowerCase() as WeekDay;
}

function parseHHMM(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Derive day status from totalMinutes, respecting stored caps and priority flags. */
function deriveDayStatus(
  totalMinutes: number,
  isHalfDayCapped: boolean,
  currentStatus: AttendanceDayStatus,
  settings: { requiredDailyMinutes: number; halfDayThresholdMinutes: number },
): AttendanceDayStatus {
  // Priority: holiday > weekend > leave/lwp > attendance-derived
  if (currentStatus === 'holiday') return 'holiday';
  if (currentStatus === 'weekend') return 'weekend';
  if (currentStatus === 'leave' || currentStatus === 'lwp') return currentStatus;

  const durationStatus: AttendanceDayStatus =
    totalMinutes >= settings.requiredDailyMinutes
      ? 'present'
      : totalMinutes >= settings.halfDayThresholdMinutes
        ? 'half-day'
        : 'absent';

  if (isHalfDayCapped && durationStatus === 'present') return 'half-day';
  return durationStatus;
}

/** Format a session for API responses. */
function formatSession(s: {
  _id: mongoose.Types.ObjectId;
  checkIn: { timestamp: Date; latitude: number; longitude: number };
  checkOut: { timestamp: Date } | null;
  durationMinutes: number | null;
  closedBySystem: boolean;
}) {
  return {
    sessionId: s._id.toHexString(),
    checkInTimestamp: s.checkIn.timestamp.toISOString(),
    checkInLocation: { latitude: s.checkIn.latitude, longitude: s.checkIn.longitude },
    checkOutTimestamp: s.checkOut ? s.checkOut.timestamp.toISOString() : null,
    durationMinutes: s.durationMinutes ?? 0,
    closedBySystem: s.closedBySystem,
  };
}

/** Format an attendance day for history/weekly/monthly responses. */
function formatDayRecord(
  day: IAttendanceDay,
  sessions: ReturnType<typeof formatSession>[],
  settings: { requiredDailyMinutes: number },
  timezone: string,
) {
  const overtimeMinutes = Math.max(0, day.totalMinutes - settings.requiredDailyMinutes);
  const zonedDate = toZonedTime(day.date, timezone);
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayOfWeek = dayNames[zonedDate.getDay()];
  return {
    dateString: day.dateString,
    dayOfWeek: dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
    status: day.status,
    totalMinutes: day.totalMinutes,
    overtimeMinutes,
    isLateArrival: day.isLateArrival,
    lateByMinutes: day.lateByMinutes,
    isHalfDayCapped: day.isHalfDayCapped,
    isHoliday: day.status === 'holiday',
    isWeekend: day.status === 'weekend',
    isRegularized: day.isRegularized,
    sessions,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface CheckInInput {
  employeeId: string;
  deviceFingerprintHeader: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  nonce: string;
  clientTimestamp: string;
}

export interface CheckOutInput {
  employeeId: string;
  nonce: string;
  clientTimestamp: string;
}

export class AttendanceService {
  // ─── Check In ─────────────────────────────────────────────────────────────

  static async checkIn(input: CheckInInput) {
    await connectDB();

    const serverTime = new Date();
    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    if (!settings) throw new AppError('GEN_500', 500, 'Company settings not configured.');

    // Load user
    const user = await User.findById(input.employeeId).lean();
    if (!user) throw new AppError('AUTH_003', 401, 'Unauthorized.');
    if (!user.isActive) throw new AppError('AUTH_007', 403, 'Account deactivated.');

    // Validate device fingerprint (BR-ATT-02)
    const FINGERPRINT_REGEX = /^[0-9a-f]{64}$/i;
    if (!FINGERPRINT_REGEX.test(input.deviceFingerprintHeader)) {
      throw new AppError('AUTH_004', 401, 'Missing or malformed device fingerprint.');
    }
    if (!user.registeredDevice) {
      throw new AppError('AUTH_005', 401, 'Device fingerprint mismatch.');
    }
    const incomingHash = sha256(input.deviceFingerprintHeader);
    if (incomingHash !== user.registeredDevice.fingerprintHash) {
      throw new AppError('AUTH_005', 401, 'Device fingerprint mismatch.');
    }

    // Validate timestamp window (BR-ATT-01)
    const clientTime = new Date(input.clientTimestamp);
    const diffMs = Math.abs(serverTime.getTime() - clientTime.getTime());
    if (diffMs > settings.checkinTimestampWindowMinutes * 60 * 1000) {
      throw new AppError('ATT_007', 422, 'Timestamp outside allowed window.');
    }

    // Consume nonce (BR-ATT-03) — BEFORE geo-fence check (nonce consumed on geofence rejection too)
    try {
      await UsedNonce.create({ nonce: input.nonce, employeeId: new mongoose.Types.ObjectId(input.employeeId), action: 'checkin' });
    } catch (err) {
      if (isMongooseDuplicateKey(err)) throw new AppError('ATT_004', 409, 'Nonce already used.');
      throw err;
    }

    // GPS accuracy check (BR-ATT-05)
    const lowGpsAccuracy = input.accuracy > settings.gpsAccuracyThresholdMeters;
    if (lowGpsAccuracy) throw new AppError('ATT_002', 422, 'GPS accuracy too low.');

    // Mock GPS detection (BR-ATT-06)
    const possibleMockGps = input.accuracy === 0;

    // Geo-fence check (BR-ATT-04)
    const distanceFromOffice = haversineMeters(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: settings.geoFence.latitude, longitude: settings.geoFence.longitude },
    );
    const isWithinGeoFence = distanceFromOffice <= settings.geoFence.radiusMeters;
    if (settings.geoFence.isEnabled && !isWithinGeoFence) {
      throw new AppError('ATT_001', 422, 'Outside geofence.');
    }

    // Compute IST date/time (BR-ATT-08)
    const timezone = settings.timezone || 'Asia/Kolkata';
    const dateString = toLocalDateString(serverTime, timezone);
    const localHHMM  = toLocalHHMM(serverTime, timezone);
    const dayOfWeek  = toLocalDayOfWeek(serverTime, timezone);

    // Weekend check
    const isWeekend = !settings.workingDays.includes(dayOfWeek);

    // Holiday check
    const holiday = await Holiday.findOne({ dateString }).lean();
    const isHoliday = !!holiday;

    // Late arrival computation
    const lateResult = computeDayStatus({
      totalMinutes: 0,
      checkInTime: localHHMM,
      requiredDailyMinutes: settings.requiredDailyMinutes,
      halfDayThresholdMinutes: settings.halfDayThresholdMinutes,
      halfDayLateCheckInTime: settings.halfDayLateCheckInTime,
      lateArrivalGraceMinutes: settings.lateArrivalGraceMinutes,
      workStartTime: settings.workStartTime,
      isWeekend,
      isHoliday,
    });

    // Determine initial day status
    let initialStatus: AttendanceDayStatus = 'absent';
    if (isHoliday) initialStatus = 'holiday';
    if (isWeekend) initialStatus = 'weekend';

    const [year, month] = dateString.split('-').map(Number);
    const dateOnly = new Date(dateString + 'T00:00:00.000Z');

    // Transaction: upsert AttendanceDay + create AttendanceSession (BR-ATT-07)
    const mongoSession = await mongoose.startSession();
    let dayDoc: IAttendanceDay;
    let sessionDoc: mongoose.Document & { _id: mongoose.Types.ObjectId };

    try {
      await mongoSession.withTransaction(async () => {
        const upserted = await AttendanceDay.findOneAndUpdate(
          { employeeId: new mongoose.Types.ObjectId(input.employeeId), dateString },
          {
            $setOnInsert: {
              date: dateOnly,
              year,
              month,
              status: initialStatus,
              totalMinutes: 0,
              requiredMinutes: settings.requiredDailyMinutes,
              overtimeMinutes: 0,
              isLateArrival: lateResult.isLateArrival,
              lateByMinutes: lateResult.lateByMinutes,
              isHalfDayCapped: lateResult.isHalfDayCapped,
              isRegularized: false,
            },
          },
          { upsert: true, new: true, session: mongoSession },
        );
        dayDoc = upserted!;

        try {
          const [created] = await AttendanceSession.create(
            [
              {
                employeeId: new mongoose.Types.ObjectId(input.employeeId),
                attendanceDayId: dayDoc._id,
                dateString,
                checkIn: {
                  latitude: input.latitude,
                  longitude: input.longitude,
                  accuracy: input.accuracy,
                  distanceFromOffice,
                  timestamp: serverTime,
                  deviceFingerprint: input.deviceFingerprintHeader,
                  nonce: input.nonce,
                  isWithinGeoFence,
                },
                checkOut: null,
                durationMinutes: null,
                isActive: true,
                closedBySystem: false,
                flags: {
                  lowGpsAccuracy,
                  outsideGeoFence: !isWithinGeoFence,
                  suspiciousTimestamp: false,
                  possibleMockGps,
                },
              },
            ],
            { session: mongoSession },
          );
          sessionDoc = created as typeof created & { _id: mongoose.Types.ObjectId };
        } catch (err) {
          if (isMongooseDuplicateKey(err)) throw new AppError('ATT_003', 409, 'Already checked in.');
          throw err;
        }
      });
    } finally {
      await mongoSession.endSession();
    }

    // Audit log
    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(input.employeeId),
      action: 'ATTENDANCE_CHECKIN',
      targetType: 'AttendanceSession',
      targetId: (sessionDoc!._id as mongoose.Types.ObjectId).toHexString(),
      changes: { dateString, latitude: input.latitude, longitude: input.longitude },
    });

    return {
      sessionId: (sessionDoc!._id as mongoose.Types.ObjectId).toHexString(),
      checkInTimestamp: serverTime.toISOString(),
      dateString,
      status: 'checked-in' as const,
      flags: {
        possibleMockGps,
        isLateArrival: lateResult.isLateArrival,
        lateByMinutes: lateResult.lateByMinutes,
        isHalfDayCapped: lateResult.isHalfDayCapped,
      },
    };
  }

  // ─── Check Out ────────────────────────────────────────────────────────────

  static async checkOut(input: CheckOutInput) {
    await connectDB();

    const serverTime = new Date();
    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    if (!settings) throw new AppError('GEN_500', 500, 'Company settings not configured.');

    // Find active session (BR-ATT-09)
    const activeSession = await AttendanceSession.findOne({
      employeeId: new mongoose.Types.ObjectId(input.employeeId),
      isActive: true,
    });
    if (!activeSession) throw new AppError('ATT_005', 422, 'No active session found.');

    // Validate timestamp window (BR-ATT-10)
    const clientTime = new Date(input.clientTimestamp);
    const diffMs = Math.abs(serverTime.getTime() - clientTime.getTime());
    if (diffMs > settings.checkinTimestampWindowMinutes * 60 * 1000) {
      throw new AppError('ATT_007', 422, 'Timestamp outside allowed window.');
    }

    // Consume nonce (BR-ATT-11)
    try {
      await UsedNonce.create({ nonce: input.nonce, employeeId: new mongoose.Types.ObjectId(input.employeeId), action: 'checkout' });
    } catch (err) {
      if (isMongooseDuplicateKey(err)) throw new AppError('ATT_004', 409, 'Nonce already used.');
      throw err;
    }

    // Compute duration
    const durationMinutes = Math.round(
      (serverTime.getTime() - activeSession.checkIn.timestamp.getTime()) / 60_000,
    );

    // Load the attendance day
    const day = await AttendanceDay.findById(activeSession.attendanceDayId);
    if (!day) throw new AppError('GEN_002', 404, 'Attendance day record not found.');

    const newTotalMinutes = day.totalMinutes + durationMinutes;
    const overtimeMinutes = Math.max(0, newTotalMinutes - settings.requiredDailyMinutes);
    const newStatus = deriveDayStatus(newTotalMinutes, day.isHalfDayCapped, day.status, settings);

    // Transaction: close session + update day (BR-ATT-12)
    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await AttendanceSession.findByIdAndUpdate(
          activeSession._id,
          {
            $set: {
              isActive: false,
              durationMinutes,
              checkOut: {
                timestamp: serverTime,
                nonce: input.nonce,
                latitude: 0,
                longitude: 0,
                accuracy: 0,
                distanceFromOffice: 0,
                deviceFingerprint: activeSession.checkIn.deviceFingerprint,
                isWithinGeoFence: true,
              },
            },
          },
          { session: mongoSession },
        );
        await AttendanceDay.findByIdAndUpdate(
          day._id,
          {
            $set: {
              totalMinutes: newTotalMinutes,
              overtimeMinutes,
              status: newStatus,
            },
          },
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }

    // Audit log
    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(input.employeeId),
      action: 'ATTENDANCE_CHECKOUT',
      targetType: 'AttendanceSession',
      targetId: (activeSession._id as mongoose.Types.ObjectId).toHexString(),
      changes: { dateString: day.dateString, durationMinutes, totalMinutes: newTotalMinutes },
    });

    return {
      sessionId: (activeSession._id as mongoose.Types.ObjectId).toHexString(),
      checkInTimestamp: activeSession.checkIn.timestamp.toISOString(),
      checkOutTimestamp: serverTime.toISOString(),
      durationMinutes,
      day: {
        dateString: day.dateString,
        status: newStatus,
        totalMinutes: newTotalMinutes,
        overtimeMinutes,
      },
    };
  }

  // ─── Today Status (BR-ATT-15 to BR-ATT-17) ───────────────────────────────

  static async getStatus(employeeId: string) {
    await connectDB();

    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    const timezone = settings?.timezone || 'Asia/Kolkata';
    const dateString = toLocalDateString(new Date(), timezone);

    const [day, activeSession, allSessions] = await Promise.all([
      AttendanceDay.findOne({ employeeId: new mongoose.Types.ObjectId(employeeId), dateString }).lean(),
      AttendanceSession.findOne({ employeeId: new mongoose.Types.ObjectId(employeeId), isActive: true }).lean(),
      AttendanceSession.find({ employeeId: new mongoose.Types.ObjectId(employeeId), dateString }).lean(),
    ]);

    const isCheckedIn = !!activeSession;
    const totalMinutes = day?.totalMinutes ?? 0;
    const requiredMinutes = settings?.requiredDailyMinutes ?? 540;

    // Running minutes for active session
    const runningMinutes = activeSession
      ? Math.round((Date.now() - activeSession.checkIn.timestamp.getTime()) / 60_000)
      : 0;

    const sessions = allSessions.map((s) => ({
      sessionId: (s._id as mongoose.Types.ObjectId).toHexString(),
      checkInTimestamp: s.checkIn.timestamp.toISOString(),
      checkOutTimestamp: s.checkOut ? s.checkOut.timestamp.toISOString() : null,
      durationMinutes: s.isActive ? runningMinutes : (s.durationMinutes ?? 0),
      closedBySystem: s.closedBySystem,
    }));

    return {
      isCheckedIn,
      todayDateString: dateString,
      currentSession: isCheckedIn && activeSession
        ? {
            sessionId: (activeSession._id as mongoose.Types.ObjectId).toHexString(),
            checkInTimestamp: activeSession.checkIn.timestamp.toISOString(),
            checkInLocation: {
              latitude: activeSession.checkIn.latitude,
              longitude: activeSession.checkIn.longitude,
            },
            elapsedMinutes: runningMinutes,
            remainingMinutes: Math.max(0, requiredMinutes - totalMinutes - runningMinutes),
          }
        : null,
      todaySummary: {
        totalMinutes: totalMinutes + runningMinutes,
        status: day?.status ?? 'absent',
        sessions,
      },
    };
  }

  // ─── History ──────────────────────────────────────────────────────────────

  static async getHistory(
    employeeId: string,
    query: { startDate: string; endDate: string; status?: string; page: number; limit: number },
  ) {
    await connectDB();

    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    const timezone = settings?.timezone || 'Asia/Kolkata';

    const filter: Record<string, unknown> = {
      employeeId: new mongoose.Types.ObjectId(employeeId),
      dateString: { $gte: query.startDate, $lte: query.endDate },
    };
    if (query.status) filter.status = query.status;

    const [days, total] = await Promise.all([
      AttendanceDay.find(filter)
        .sort({ dateString: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      AttendanceDay.countDocuments(filter),
    ]);

    const dayIds = days.map((d) => (d._id as mongoose.Types.ObjectId));
    const sessions = await AttendanceSession.find({ attendanceDayId: { $in: dayIds } })
      .sort({ 'checkIn.timestamp': 1 })
      .lean();

    const sessionsByDay = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const key = (s.attendanceDayId as mongoose.Types.ObjectId).toHexString();
      if (!sessionsByDay.has(key)) sessionsByDay.set(key, []);
      sessionsByDay.get(key)!.push(s);
    }

    const data = days.map((day) => {
      const daySessions = sessionsByDay.get((day._id as mongoose.Types.ObjectId).toHexString()) ?? [];
      return formatDayRecord(
        day as unknown as IAttendanceDay,
        daySessions.map(formatSession),
        settings ?? { requiredDailyMinutes: 540 },
        timezone,
      );
    });

    return {
      data,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  // ─── Today — Admin Dashboard (§5.5) ───────────────────────────────────────

  static async getTodayAllEmployees(query: {
    status?: string;
    department?: string;
    page: number;
    limit: number;
  }) {
    await connectDB();

    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    const timezone = settings?.timezone || 'Asia/Kolkata';
    const dateString = toLocalDateString(new Date(), timezone);

    // Build employee filter
    const empFilter: Record<string, unknown> = { isActive: true, role: 'employee' };
    if (query.department) empFilter.department = query.department;

    const [allEmployees, total] = await Promise.all([
      User.find(empFilter)
        .select('_id employeeId firstName lastName department')
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      User.countDocuments(empFilter),
    ]);

    const employeeIds = allEmployees.map((e) => e._id);

    const [days, activeSessions] = await Promise.all([
      AttendanceDay.find({ employeeId: { $in: employeeIds }, dateString }).lean(),
      AttendanceSession.find({ employeeId: { $in: employeeIds }, isActive: true }).lean(),
    ]);

    const dayByEmployee = new Map(days.map((d) => [(d.employeeId as mongoose.Types.ObjectId).toHexString(), d]));
    const activeSessionByEmployee = new Map(activeSessions.map((s) => [(s.employeeId as mongoose.Types.ObjectId).toHexString(), s]));
    const now = Date.now();

    const data = allEmployees
      .map((emp) => {
        const empIdStr = (emp._id as mongoose.Types.ObjectId).toHexString();
        const day = dayByEmployee.get(empIdStr);
        const active = activeSessionByEmployee.get(empIdStr);
        const isCheckedIn = !!active;
        const elapsedMinutes = active
          ? Math.round((now - active.checkIn.timestamp.getTime()) / 60_000)
          : 0;

        const derivedStatus = isCheckedIn ? 'checked-in' : day ? 'checked-out' : 'absent';
        if (query.status && derivedStatus !== query.status) return null;

        return {
          employeeId: emp.employeeId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          department: emp.department ?? null,
          isCheckedIn,
          checkInTime: active ? active.checkIn.timestamp.toISOString() : null,
          elapsedMinutes,
          dayStatus: day?.status ?? 'absent',
          totalMinutesToday: (day?.totalMinutes ?? 0) + elapsedMinutes,
        };
      })
      .filter(Boolean);

    return {
      data,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  // ─── Weekly Summary (§5.6) ────────────────────────────────────────────────

  static async getWeekly(employeeId: string, weekStr?: string) {
    await connectDB();

    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    const timezone = settings?.timezone || 'Asia/Kolkata';

    // Parse week string YYYY-Www or default to current week
    let monday: Date;
    if (weekStr) {
      const [yearStr, weekNumStr] = weekStr.split('-W');
      const year = parseInt(yearStr, 10);
      const weekNum = parseInt(weekNumStr, 10);
      const jan4 = new Date(year, 0, 4);
      const dayOfWeek = jan4.getDay() || 7;
      monday = new Date(jan4.getTime() + (weekNum - 1) * 7 * 86_400_000 - (dayOfWeek - 1) * 86_400_000);
    } else {
      const now = toZonedTime(new Date(), timezone);
      const dow = now.getDay() || 7;
      monday = new Date(now.getTime() - (dow - 1) * 86_400_000);
      monday.setHours(0, 0, 0, 0);
    }

    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const startDate = monday.toISOString().split('T')[0];
    const endDate   = sunday.toISOString().split('T')[0];

    const result = await this.getHistory(employeeId, { startDate, endDate, page: 1, limit: 7 });
    const totalMinutes = result.data.reduce((sum, d) => sum + d.totalMinutes, 0);
    const totalOvertimeMinutes = result.data.reduce((sum, d) => sum + d.overtimeMinutes, 0);

    const isoWeek = weekStr ?? (() => {
      const year = monday.getFullYear();
      const jan4 = new Date(year, 0, 4);
      const dayOfJan4 = jan4.getDay() || 7;
      const weekNum = Math.ceil(((monday.getTime() - jan4.getTime()) / 86_400_000 + dayOfJan4) / 7);
      return `${year}-W${String(weekNum).padStart(2, '0')}`;
    })();

    return {
      week: isoWeek,
      startDate,
      endDate,
      totalMinutes,
      totalOvertimeMinutes,
      days: result.data,
    };
  }

  // ─── Monthly Summary (§5.7) ───────────────────────────────────────────────

  static async getMonthly(employeeId: string, yearMonthStr?: string) {
    await connectDB();

    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    const timezone = settings?.timezone || 'Asia/Kolkata';

    const yearMonth = yearMonthStr ?? formatInTimeZone(new Date(), timezone, 'yyyy-MM');
    const [yearStr, monthStr] = yearMonth.split('-');
    const year  = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = `${yearMonth}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const endDate   = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    const result = await this.getHistory(employeeId, { startDate, endDate, page: 1, limit: 100 });

    const summary = {
      workingDaysInMonth: 0,
      presentDays: 0,
      halfDays: 0,
      absentDays: 0,
      leaveDays: 0,
      holidayDays: 0,
      weekendDays: 0,
      totalMinutes: 0,
      overtimeMinutes: 0,
    };

    const workingDays = settings?.workingDays ?? ['monday','tuesday','wednesday','thursday','friday'];
    // Count working days in month
    const current = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    while (current <= end) {
      const dow = toLocalDayOfWeek(current, timezone);
      if (workingDays.includes(dow)) summary.workingDaysInMonth++;
      current.setDate(current.getDate() + 1);
    }

    for (const d of result.data) {
      summary.totalMinutes += d.totalMinutes;
      summary.overtimeMinutes += d.overtimeMinutes;
      if (d.status === 'present') summary.presentDays++;
      else if (d.status === 'half-day') summary.halfDays++;
      else if (d.status === 'absent') summary.absentDays++;
      else if (d.status === 'leave' || d.status === 'lwp') summary.leaveDays++;
      else if (d.status === 'holiday') summary.holidayDays++;
      else if (d.status === 'weekend') summary.weekendDays++;
    }

    return { yearMonth, summary, days: result.data };
  }

  // ─── Auto Close Sessions (midnight rollover cron) ─────────────────────────

  static async autoCloseSessions(dateString: string): Promise<{ closed: number }> {
    await connectDB();

    const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
    if (!settings) return { closed: 0 };

    // Find all sessions that were active on the given date and are still active
    const orphanedSessions = await AttendanceSession.find({
      dateString,
      isActive: true,
    });

    if (orphanedSessions.length === 0) return { closed: 0 };

    // Compute work end time as the close timestamp
    const [endH, endM] = settings.workEndTime.split(':').map(Number);
    let closed = 0;

    for (const session of orphanedSessions) {
      // Cap duration: min(workEndTime, checkIn + 16h) - checkIn
      const checkInDate = session.checkIn.timestamp;
      const capDate = new Date(checkInDate);
      capDate.setHours(endH, endM, 0, 0);
      if (capDate <= checkInDate) capDate.setDate(capDate.getDate() + 1);

      const maxDuration = 16 * 60;
      const naturalDuration = Math.round((capDate.getTime() - checkInDate.getTime()) / 60_000);
      const durationMinutes = Math.min(naturalDuration, maxDuration);

      // Load day
      const day = await AttendanceDay.findById(session.attendanceDayId);
      if (!day) continue;

      const newTotalMinutes = day.totalMinutes + durationMinutes;
      const overtimeMinutes = Math.max(0, newTotalMinutes - settings.requiredDailyMinutes);
      const newStatus = deriveDayStatus(newTotalMinutes, day.isHalfDayCapped, day.status, settings);

      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          await AttendanceSession.findByIdAndUpdate(
            session._id,
            {
              $set: {
                isActive: false,
                closedBySystem: true,
                systemCloseReason: 'midnight-rollover' as const,
                durationMinutes,
                checkOut: {
                  timestamp: capDate,
                  nonce: 'system-auto-close',
                  latitude: 0,
                  longitude: 0,
                  accuracy: 0,
                  distanceFromOffice: 0,
                  deviceFingerprint: session.checkIn.deviceFingerprint,
                  isWithinGeoFence: true,
                },
              },
            },
            { session: mongoSession },
          );
          await AttendanceDay.findByIdAndUpdate(
            day._id,
            { $set: { totalMinutes: newTotalMinutes, overtimeMinutes, status: newStatus } },
            { session: mongoSession },
          );
        });
        closed++;
      } finally {
        await mongoSession.endSession();
      }
    }

    return { closed };
  }

  // ─── Admin List (§5.8) — cross-employee attendance list for admin portal ────

  static async adminList(query: {
    date?: string;
    startDate?: string;
    endDate?: string;
    employeeId?: string;
    status?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    await connectDB();

    const filter: Record<string, unknown> = {};

    // Date range
    if (query.date) {
      filter.dateString = query.date;
    } else if (query.startDate || query.endDate) {
      const range: Record<string, string> = {};
      if (query.startDate) range.$gte = query.startDate;
      if (query.endDate)   range.$lte = query.endDate;
      filter.dateString = range;
    }

    if (query.status) filter.status = query.status;

    // Employee filter (explicit ID takes precedence over search)
    if (query.employeeId) {
      filter.employeeId = new mongoose.Types.ObjectId(query.employeeId);
    } else if (query.search) {
      const safe  = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');
      const matchingUsers = await User.find(
        { $or: [{ firstName: regex }, { lastName: regex }, { employeeId: regex }] },
      ).select('_id').lean();
      filter.employeeId = { $in: matchingUsers.map((u) => u._id) };
    }

    const skip = (query.page - 1) * query.limit;
    const [days, total] = await Promise.all([
      AttendanceDay.find(filter)
        .populate('employeeId', 'firstName lastName employeeId email department')
        .sort({ dateString: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      AttendanceDay.countDocuments(filter),
    ]);

    // Batch-fetch first check-in / last check-out for all returned days
    const dayIds = days.map((d) => d._id as mongoose.Types.ObjectId);
    const sessions = await AttendanceSession.find({ attendanceDayId: { $in: dayIds } })
      .select('attendanceDayId checkIn.timestamp checkOut.timestamp')
      .sort({ 'checkIn.timestamp': 1 })
      .lean();

    const sessionsByDay = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const key = (s.attendanceDayId as mongoose.Types.ObjectId).toHexString();
      if (!sessionsByDay.has(key)) sessionsByDay.set(key, []);
      sessionsByDay.get(key)!.push(s);
    }

    type PopulatedEmp = { _id: mongoose.Types.ObjectId; firstName: string; lastName: string; employeeId: string; email: string; department?: string };

    const data = days.map((day) => {
      const dayId   = (day._id as mongoose.Types.ObjectId).toHexString();
      const ss      = sessionsByDay.get(dayId) ?? [];
      const first   = ss[0];
      const last    = ss[ss.length - 1];
      const emp     = day.employeeId as unknown as PopulatedEmp | null;

      return {
        _id:          dayId,
        employeeId:   emp
          ? { _id: emp._id.toHexString(), firstName: emp.firstName, lastName: emp.lastName, employeeId: emp.employeeId, email: emp.email, department: emp.department ?? null }
          : (day.employeeId as mongoose.Types.ObjectId).toHexString(),
        date:         (day.date as Date).toISOString(),
        dateString:   day.dateString,
        status:       day.status,
        checkIn:      first  ? first.checkIn.timestamp.toISOString().slice(11, 16) : null,
        checkOut:     (last && last.checkOut) ? last.checkOut.timestamp.toISOString().slice(11, 16) : null,
        workHours:    day.totalMinutes > 0 ? Math.round((day.totalMinutes / 60) * 10) / 10 : null,
        isRegularized: day.isRegularized,
        createdAt:    (day.createdAt as Date).toISOString(),
      };
    });

    return {
      data,
      pagination: {
        page:       query.page,
        limit:      query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
