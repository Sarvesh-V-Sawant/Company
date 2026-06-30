import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const AuditLogListQuerySchema = z.object({
  search:   z.string().max(100).optional(),
  action:   z.string().max(100).optional(),
  entity:   z.string().max(100).optional(),
  dateFrom: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditLogListQuery = z.infer<typeof AuditLogListQuerySchema>;
