import { z } from 'zod';

export const ComputePayrollSchema = z.object({
  yearMonth:  z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  employeeId: z.string().regex(/^[0-9a-f]{24}$/i, 'Must be a valid ObjectId').optional(),
});

export const PayrollListQuerySchema = z.object({
  yearMonth:  z.string().regex(/^\d{4}-\d{2}$/).optional(),
  employeeId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  status:     z.enum(['draft', 'finalised']).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
});

export const PayrollMeQuerySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
});

export const UnfinalisePayrollSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

export const AdjustPayrollSchema = z.object({
  manualDeduction: z.number().min(0),
  remark:          z.string().max(200).optional(),
}).superRefine((data, ctx) => {
  if (data.manualDeduction > 0 && (!data.remark || data.remark.trim() === '')) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      message: 'Remark is required when manualDeduction > 0',
      path:    ['remark'],
    });
  }
});

export const LockPayrollSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
});

export const UnlockPayrollSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  reason:    z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

export type ComputePayrollInput    = z.infer<typeof ComputePayrollSchema>;
export type PayrollListQuery       = z.infer<typeof PayrollListQuerySchema>;
export type PayrollMeQuery         = z.infer<typeof PayrollMeQuerySchema>;
export type UnfinalisePayrollInput = z.infer<typeof UnfinalisePayrollSchema>;
export type AdjustPayrollInput     = z.infer<typeof AdjustPayrollSchema>;
export type LockPayrollInput       = z.infer<typeof LockPayrollSchema>;
export type UnlockPayrollInput     = z.infer<typeof UnlockPayrollSchema>;
