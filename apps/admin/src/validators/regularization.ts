import { z } from 'zod';

const REGULARIZATION_TYPES = [
  'forgotCheckIn',
  'forgotCheckOut',
  'workAwayFromOffice',
  'officialTravel',
  'clientVisit',
] as const;

const REGULARIZATION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;

export const CreateRegularizationSchema = z
  .object({
    date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    type:              z.enum(REGULARIZATION_TYPES),
    requestedCheckIn:  z.string().datetime({ offset: true }).optional(),
    requestedCheckOut: z.string().datetime({ offset: true }).optional(),
    reason:            z.string().min(10, 'reason must be at least 10 characters').max(500),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'forgotCheckIn' && !data.requestedCheckIn) {
      ctx.addIssue({ code: 'custom', message: 'requestedCheckIn is required for forgotCheckIn', path: ['requestedCheckIn'] });
    }
    if (data.type === 'forgotCheckOut' && !data.requestedCheckOut) {
      ctx.addIssue({ code: 'custom', message: 'requestedCheckOut is required for forgotCheckOut', path: ['requestedCheckOut'] });
    }
  });

export const RejectRegularizationSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const RegularizationListQuerySchema = z.object({
  employeeId: z.string().optional(),
  status:     z.enum(REGULARIZATION_STATUSES).optional(),
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateRegularizationInput = z.infer<typeof CreateRegularizationSchema>;
export type RegularizationListQuery   = z.infer<typeof RegularizationListQuerySchema>;
