import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { MarkAllReadSchema } from '@validators/notification';
import { NotificationService } from '@services/NotificationService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError, success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let payload;
  try {
    payload = await getAuthUser(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return apiError('GEN_001', 'Invalid JSON body.', 400);
  }

  let input;
  try {
    input = MarkAllReadSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  const result = await NotificationService.markAllRead({ userId: payload.userId, input });
  return success(result);
}
