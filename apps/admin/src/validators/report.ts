import { z } from 'zod';

const dateStr  = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Must be a valid ObjectId');

export const AttendanceReportQuerySchema = z.object({
  startDate:  dateStr,
  endDate:    dateStr,
  employeeId: objectId.optional(),
  department: z.string().optional(),
  status:     z.enum(['present','absent','half-day','leave','holiday','weekend','lwp','not-applicable']).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
});

export const AttendanceExportQuerySchema = AttendanceReportQuerySchema.omit({ page: true, limit: true });

export const LeaveReportQuerySchema = z.object({
  employeeId: objectId.optional(),
  department: z.string().optional(),
  leaveType:  z.enum(['paidLeave','sickLeave','casualLeave','lwp']).optional(),
  status:     z.enum(['pending','approved','rejected','cancelled','revoked','withdrawn']).optional(),
  leaveYear:  z.coerce.number().int().min(2020).max(2099).optional(),
  startDate:  dateStr.optional(),
  endDate:    dateStr.optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
});

export const LeaveExportQuerySchema = LeaveReportQuerySchema.omit({ page: true, limit: true });

export const PayrollReportQuerySchema = z.object({
  yearMonth:  z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM').optional(),
  status:     z.enum(['draft','finalised']).optional(),
  department: z.string().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
});

export const PayrollExportQuerySchema = PayrollReportQuerySchema
  .omit({ page: true, limit: true })
  .extend({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM') });

export const EmployeeSummaryQuerySchema = z.object({
  month:      z.coerce.number().int().min(1).max(12).optional(),
  year:       z.coerce.number().int().min(2020).max(2099).optional(),
  department: z.string().optional(),
  employeeId: objectId.optional(),
});

export const DepartmentSummaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year:  z.coerce.number().int().min(2020).max(2099).optional(),
});

export type AttendanceReportQuery  = z.infer<typeof AttendanceReportQuerySchema>;
export type AttendanceExportQuery  = z.infer<typeof AttendanceExportQuerySchema>;
export type LeaveReportQuery       = z.infer<typeof LeaveReportQuerySchema>;
export type LeaveExportQuery       = z.infer<typeof LeaveExportQuerySchema>;
export type PayrollReportQuery     = z.infer<typeof PayrollReportQuerySchema>;
export type PayrollExportQuery     = z.infer<typeof PayrollExportQuerySchema>;
export type EmployeeSummaryQuery   = z.infer<typeof EmployeeSummaryQuerySchema>;
export type DepartmentSummaryQuery = z.infer<typeof DepartmentSummaryQuerySchema>;
