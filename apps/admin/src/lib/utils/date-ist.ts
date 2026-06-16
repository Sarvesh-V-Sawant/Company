import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const IST = 'Asia/Kolkata';

export function getCurrentDateIST(): Date {
  return toZonedTime(new Date(), IST);
}

export function getCurrentMonthIST(): string {
  return format(getCurrentDateIST(), 'yyyy-MM');
}

export function toISTString(date: Date): string {
  return format(toZonedTime(date, IST), 'yyyy-MM-dd');
}

export function fromISTDate(dateStr: string): Date {
  return fromZonedTime(new Date(`${dateStr}T00:00:00`), IST);
}

export function getMonthBoundsIST(yearMonth: string): { start: Date; end: Date } {
  const base = fromZonedTime(new Date(`${yearMonth}-01T00:00:00`), IST);
  return {
    start: startOfMonth(base),
    end: endOfMonth(base),
  };
}
