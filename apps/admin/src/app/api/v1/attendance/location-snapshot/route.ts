import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { CreateLocationSnapshotSchema } from '@validators/locationSnapshot';
import { LocationSnapshotService } from '@services/LocationSnapshotService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError, success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload;
  try {
    payload = await getAuthUser(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('GEN_001', 'Invalid JSON body.', 400);
  }

  let parsed;
  try {
    parsed = CreateLocationSnapshotSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', err.errors[0]?.message ?? 'Validation failed.', 400);
    throw err;
  }

  try {
    const result = await LocationSnapshotService.create(payload.userId, parsed);
    return success(result, 201);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
