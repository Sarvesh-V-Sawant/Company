/**
 * Small guards shared by the Work Desk services and the import engine.
 *
 * Atlas M0 has no multi-document transactions, so consistency is built from
 * (a) unique indexes, (b) conditional single-document updates and (c) ordering
 * writes so a mid-way failure leaves something visible rather than something
 * silently lost. These helpers exist to keep that approach uniform.
 */
import { AppError } from '@services/AuthService';

/** True for a MongoDB duplicate-key (E11000) failure, from mongoose or the driver. */
export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

/**
 * Runs a write and converts a duplicate-key failure into a coded 409, so two
 * requests racing past a read-then-write uniqueness check produce a clean
 * conflict for the loser instead of an unhandled 500.
 */
export async function withDuplicateGuard<T>(
  run: () => Promise<T>,
  code: string,
  message: string,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(code, 409, message);
    throw err;
  }
}

/**
 * Flattens an Excel cell value into a plain scalar. exceljs returns objects for
 * hyperlinks (Excel auto-links e-mail addresses), rich text and formulas; left
 * alone those stringify to "[object Object]" and fail validation.
 */
export function normalizeCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'object') return value;

  const v = value as Record<string, unknown>;
  if (Array.isArray(v.richText)) {
    return (v.richText as Array<{ text?: unknown }>).map((r) => String(r.text ?? '')).join('');
  }
  if ('result' in v && ('formula' in v || 'sharedFormula' in v)) {
    return normalizeCellValue(v.result);
  }
  if ('text' in v && ('hyperlink' in v || 'text' in v)) {
    const text = normalizeCellValue(v.text);
    if (typeof text === 'string' && text.trim()) return text;
    if (typeof v.hyperlink === 'string') return v.hyperlink.replace(/^mailto:/i, '');
    return text;
  }
  if ('error' in v) return undefined;
  return String(value);
}

/**
 * User-facing text for a zod failure: names up to three failing fields, e.g.
 * "Validation failed. phone: Invalid phone number; name: Required". Same wording family as
 * the chain routes (ops-route.ts), so every Work Desk screen reports errors alike.
 */
export function zodMessage(err: { issues: Array<{ path: Array<string | number>; message: string }> }): string {
  const parts = err.issues.slice(0, 3).map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
  const more = err.issues.length > 3 ? ` (+${err.issues.length - 3} more)` : '';
  return `Validation failed. ${parts.join('; ')}${more}`.trim();
}
