import type { DayStatus } from '@app-types/enums';

export interface DayStatusInput {
  totalMinutes: number;
  checkInTime?: string;
  requiredDailyMinutes: number;
  halfDayThresholdMinutes: number;
  halfDayLateCheckInTime: string;
  lateArrivalGraceMinutes: number;
  workStartTime: string;
  isLeave?: boolean;
  isHoliday?: boolean;
  isWeekend?: boolean;
}

export interface DayStatusResult {
  finalStatus: DayStatus;
  isLateArrival: boolean;
  lateByMinutes: number;
  isHalfDayCapped: boolean;
  durationStatus: DayStatus;
}

function parseHHMM(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function computeDayStatus(input: DayStatusInput): DayStatusResult {
  if (input.isWeekend) return { finalStatus: 'weekend', isLateArrival: false, lateByMinutes: 0, isHalfDayCapped: false, durationStatus: 'weekend' };
  if (input.isHoliday) return { finalStatus: 'holiday', isLateArrival: false, lateByMinutes: 0, isHalfDayCapped: false, durationStatus: 'holiday' };
  if (input.isLeave) return { finalStatus: 'leave', isLateArrival: false, lateByMinutes: 0, isHalfDayCapped: false, durationStatus: 'leave' };

  const durationStatus: DayStatus =
    input.totalMinutes >= input.requiredDailyMinutes
      ? 'present'
      : input.totalMinutes >= input.halfDayThresholdMinutes
        ? 'half-day'
        : 'absent';

  let isLateArrival = false;
  let lateByMinutes = 0;
  let isHalfDayCapped = false;

  if (input.checkInTime) {
    const checkInMin = parseHHMM(input.checkInTime);
    const lateMarkMin = parseHHMM(input.workStartTime) + input.lateArrivalGraceMinutes;
    const halfDayCapMin = parseHHMM(input.halfDayLateCheckInTime);

    if (checkInMin > lateMarkMin) {
      isLateArrival = true;
      lateByMinutes = checkInMin - lateMarkMin;
    }
    if (checkInMin >= halfDayCapMin) {
      isHalfDayCapped = true;
    }
  }

  const statusPriority: DayStatus[] = ['absent', 'half-day', 'present'];
  const lateCapStatus: DayStatus = isHalfDayCapped ? 'half-day' : 'present';
  const finalStatus =
    statusPriority.indexOf(durationStatus) <= statusPriority.indexOf(lateCapStatus)
      ? durationStatus
      : lateCapStatus;

  return { finalStatus, isLateArrival, lateByMinutes, isHalfDayCapped, durationStatus };
}
