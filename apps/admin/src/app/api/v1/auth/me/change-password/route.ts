import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ChangePasswordSchema } from '@validators/auth';
import { AuthService, AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { authLimiter, getClientIp, checkRateLimit } from '@mw/rateLimiter';
import { success, apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const limited = await checkRateLimit(authLimiter, ip);
  if (limited) return limited;

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
    parsed = ChangePasswordSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  try {
    const result = await AuthService.changePassword(
      payload.userId,
      parsed.currentPassword,
      parsed.newPassword,
      ip,
      request.headers.get('user-agent') ?? '',
    );
    return success({
      message: 'Password changed successfully. Other devices have been logged out.',
      accessToken: result.accessToken,
    });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
