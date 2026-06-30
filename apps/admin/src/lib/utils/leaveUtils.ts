/**
 * Compute the leave year boundaries for a given date.
 * E-DAT-01: getLeaveYearBoundaries(2026-06-14, 1) → { leaveYear: 2026, start: 2026-01-01, end: 2026-12-31 }
 * E-DAT-02: getLeaveYearBoundaries(2026-06-14, 4) → { leaveYear: 2026, start: 2026-04-01, end: 2027-03-31 }
 * E-DAT-03: getLeaveYearBoundaries(2026-03-15, 4) → { leaveYear: 2025, start: 2025-04-01, end: 2026-03-31 }
 */
export function getLeaveYearBoundaries(
  date: Date,
  leaveYearStartMonth: number, // 1 = January, 4 = April
): { leaveYear: number; start: Date; end: Date } {
  const year  = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-based, UTC

  let leaveYear: number;
  let startYear: number;

  if (leaveYearStartMonth === 1) {
    leaveYear = year;
    startYear = year;
  } else if (month >= leaveYearStartMonth) {
    leaveYear = year;
    startYear = year;
  } else {
    leaveYear = year - 1;
    startYear = year - 1;
  }

  const start = new Date(Date.UTC(startYear, leaveYearStartMonth - 1, 1));
  // end = last day of the month before leaveYearStartMonth in the next cycle
  const end   = new Date(Date.UTC(startYear + 1, leaveYearStartMonth - 1, 0));

  return { leaveYear, start, end };
}

/** Returns array of YYYY-MM-DD strings for every calendar day from start to end (inclusive). */
export function dateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cur.getTime() <= endMs) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Returns ISO weekday name (lowercase) for a YYYY-MM-DD string. */
export function weekdayOf(dateString: string): string {
  const d = new Date(dateString + 'T00:00:00Z');
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getUTCDay()];
}

/**
 * Count working days between start and end (inclusive), excluding holidays.
 * Uses UTC dates so there is no timezone shift on iteration.
 */
export function getWorkingDaysBetween(
  start: Date,
  end: Date,
  workingDays: string[],
  holidayDates: string[],
): number {
  if (start > end) return 0;
  const holidaySet = new Set(holidayDates);
  let count = 0;
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cur.getTime() <= endMs) {
    const ds = cur.toISOString().slice(0, 10);
    if (workingDays.includes(weekdayOf(ds)) && !holidaySet.has(ds)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}
