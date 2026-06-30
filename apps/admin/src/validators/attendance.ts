import { z } from 'zod';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const CheckInSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy:  z.number().min(0),
  nonce:     z.string().regex(UUID_V4_REGEX, 'Must be UUID v4').max(36),
  timestamp: z.string().regex(ISO8601_REGEX, 'Must be ISO 8601 UTC datetime'),
});

export const CheckOutSchema = z.object({
  nonce:     z.string().regex(UUID_V4_REGEX, 'Must be UUID v4').max(36),
  timestamp: z.string().regex(ISO8601_REGEX, 'Must be ISO 8601 UTC datetime'),
});

export const AttendanceHistoryQuerySchema = z.object({
  startDate:  z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  endDate:    z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  status:     z.enum(['present','absent','half-day','leave','holiday','weekend','lwp']).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(31),
}).refine(
  (d) => {
    const start = new Date(d.startDate);
    const end   = new Date(d.endDate);
    const diffDays = (end.getTime() - start.getTime()) / 86_400_000;
    return end >= start && diffDays <= 31;
  },
  { message: 'endDate must be >= startDate and range must be ≤ 31 days' },
);

export const AttendanceTodayQuerySchema = z.object({
  status:     z.enum(['checked-in','checked-out','absent']).optional(),
  department: z.string().max(100).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
});

export const AttendanceWeeklyQuerySchema = z.object({
  week:       z.string().regex(/^\d{4}-W\d{2}$/, 'Must be YYYY-Www').optional(),
  employeeId: z.string().optional(),
});

export const AttendanceMonthlyQuerySchema = z.object({
  yearMonth:  z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM').optional(),
  employeeId: z.string().optional(),
});

export const AttendanceAdminListQuerySchema = z.object({
  date:        z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD').optional(),
  startDate:   z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD').optional(),
  endDate:     z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD').optional(),
  employeeId:  z.string().optional(),
  status:      z.enum(['present','absent','half-day','leave','holiday','weekend','lwp']).optional(),
  search:      z.string().max(200).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(2000).default(20),
});
