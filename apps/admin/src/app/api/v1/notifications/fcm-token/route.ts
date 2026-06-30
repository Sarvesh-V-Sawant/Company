import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { RegisterFcmTokenSchema } from '@validators/auth';
import { AuthService, AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { success, apiError } from '@lib/utils/api-response';

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
    parsed = RegisterFcmTokenSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  try {
    await AuthService.updateFcmToken(
      payload.userId,
      parsed.token,
      parsed.deviceId,
      parsed.platform,
    );
    return success({ message: 'FCM token registered.' });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
