import { NextRequest } from 'next/server';
import { z, ZodError } from 'zod';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError, success } from '@lib/utils/api-response';
import { commitBatch, discardBatch } from '@services/ops/ImportEngine';
import { ImportBatch } from '@models/ops/ImportBatch';
import { connectDB } from '@lib/db/connect';
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

  // commit — load batch and re-run rows (canteen/manufacturer/product only for now)
  await connectDB();
  const batch = await ImportBatch.findById(parsed.batchId);
  if (!batch) return apiError('OPS_019', 'Import batch not found.', 404);
  if (batch.status !== 'previewed') return apiError('OPS_020', `Batch status is "${batch.status}" — only "previewed" batches can be committed.`, 409);
  if (batch.errorRows > 0) return apiError('OPS_021', `Batch has ${batch.errorRows} row error(s). Fix the file and re-upload before committing.`, 422);

  try {
    await commitBatch(parsed.batchId, async () => 0, []); // rows already validated at preview; commit marks status
    return success({ batchId: parsed.batchId, status: 'committed', importedRows: batch.validRows });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
