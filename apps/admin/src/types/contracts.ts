import type { WeekDay } from './enums';

export interface AttendanceSettingsContract {
  workStartTime: string;
  workEndTime: string;
  sessionAutoClosePaddingMinutes: number;
  lateArrivalGraceMinutes: number;
  halfDayLateCheckInTime: string;
  requiredDailyMinutes: number;
  halfDayThresholdMinutes: number;
  workingDays: WeekDay[];
  timezone: string;
}

export interface LeaveSettingsContract {
  leaveTypes: Array<{ code: string; name: string; daysPerYear: number }>;
  leaveYearStartMonth: number;
}

export interface RegularizationSettingsContract {
  maxDaysBack: number;
}
