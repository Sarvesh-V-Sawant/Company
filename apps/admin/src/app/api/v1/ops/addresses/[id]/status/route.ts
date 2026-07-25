import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AddressStatusSchema } from '@validators/ops/address';
import { AddressService } from '@services/ops/AddressService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { success, apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus); throw err; }
  try { assertRole(payload, 'super_admin', 'admin'); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Forbidden.', err.httpStatus); throw err; }

  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError('GEN_001', 'Invalid JSON body.', 400); }

  let parsed;
  try { parsed = AddressStatusSchema.parse(body); }
  catch (err) { if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400); throw err; }

  try {
    await AddressService.setStatus(id, parsed.isActive, payload.userId);
    return success({ id, isActive: parsed.isActive });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
