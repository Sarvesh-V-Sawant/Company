import { z } from 'zod';

export const NotificationListQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  isRead: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  type:   z.string().optional(),
});

export const MarkAllReadSchema = z.object({
  ids: z.array(z.string().regex(/^[0-9a-f]{24}$/i, 'Must be a valid ObjectId')).optional(),
});

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
export type MarkAllReadInput      = z.infer<typeof MarkAllReadSchema>;
