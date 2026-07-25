import { z } from 'zod';

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const MONGO_ID_REGEX = /^[0-9a-f]{24}$/i;

export const GstinSchema = z
  .string()
  .regex(GSTIN_REGEX, 'Invalid GSTIN format (15-character Indian GSTIN expected)')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v));

export const MongoIdSchema = z.string().regex(MONGO_ID_REGEX, 'Invalid ID');

export const OpsListQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().max(100).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sortBy:   z.string().max(50).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
