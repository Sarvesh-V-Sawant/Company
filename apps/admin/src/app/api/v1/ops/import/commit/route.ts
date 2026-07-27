import { NextRequest } from 'next/server';
import { z, ZodError } from 'zod';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError, success } from '@lib/utils/api-response';
import { commitBatch, discardBatch } from '@services/ops/ImportEngine';
import { AppError } from '@services/AuthService';

export const dynamic = 'force-dynamic';

const CommitSchema = z.object({
  batchId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid batchId'),
  action: z.enum(['commit', 'discard']),
});

export async function POST(request: NextRequest) {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus); throw err; }
  try { assertRole(payload, 'super_admin', 'admin', 'manager'); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Forbidden.', err.httpStatus); throw err; }

  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError('GEN_001', 'Invalid JSON body.', 400); }

  let parsed;
  try { parsed = CommitSchema.parse(body); }
  catch (err) { if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400); throw err; }

  if (parsed.action === 'discard') {
    try {
      await discardBatch(parsed.batchId);
      return success({ batchId: parsed.batchId, status: 'discarded' });
    } catch (err) {
      if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
      throw err;
    }
  }

  try {
    const result = await commitBatch(parsed.batchId, payload.userId);
    return success(result);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
