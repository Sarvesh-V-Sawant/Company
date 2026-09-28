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

// ─── Hardening helpers (30.03) ───────────────────────────────────────────────
// Shared so the single-record APIs and the Excel import validate identically.

/** Master codes: letters, digits and . _ - / only — no spaces, no unicode. Applied after upper-casing. */
export const CODE_REGEX = /^[A-Z0-9][A-Z0-9._\-/]*$/;
export const PHONE_REGEX = /^[0-9+()\-.\s]{5,20}$/;
export const HSN_REGEX = /^\d{4,8}$/;
/** GST state code (01–38, 97, 99) or a 2-letter state abbreviation. */
export const STATE_CODE_REGEX = /^(\d{2}|[A-Z]{2})$/;

export const MASTER_CODE_MESSAGE = 'Use letters, digits and . _ - / only (no spaces)';

/** Required, trimmed, non-blank text. */
export const requiredText = (max: number) => z.string().trim().min(1, 'Required').max(max);

/** Optional trimmed text; an empty string is kept as '' so a form can clear a field. */
export const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Optional phone; '' allowed (clears the field). */
export const PhoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === '' || PHONE_REGEX.test(v), 'Invalid phone number')
  .optional();

/** A real calendar date, either YYYY-MM-DD or a full ISO datetime. Rejects 2026-13-45. */
export const DateInputSchema = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v) && !Number.isNaN(new Date(v).getTime()), {
    message: 'Must be a valid date (YYYY-MM-DD)',
  })
  .refine((v) => {
    // new Date('2026-02-31') silently rolls over in some engines — round-trip the day.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }, { message: 'Must be a valid calendar date' });

/** Money / rate: finite, non-negative, bounded, at most 2 decimal places. */
export const RateSchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, { message: 'At most 2 decimal places allowed' });

/** Refinement helper: effectiveTo must not be before effectiveFrom. */
export const dateRangeOk = (d: { effectiveFrom?: string; effectiveTo?: string }): boolean =>
  !d.effectiveFrom || !d.effectiveTo || new Date(d.effectiveTo).getTime() >= new Date(d.effectiveFrom).getTime();
