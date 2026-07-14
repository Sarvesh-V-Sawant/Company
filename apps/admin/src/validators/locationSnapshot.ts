import { z } from 'zod';

export const CreateLocationSnapshotSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy:  z.number().min(0).max(10000),
});

export const ListLocationSnapshotsSchema = z.object({
  employeeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  dateString: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateLocationSnapshotInput = z.infer<typeof CreateLocationSnapshotSchema>;
export type ListLocationSnapshotsInput  = z.infer<typeof ListLocationSnapshotsSchema>;
