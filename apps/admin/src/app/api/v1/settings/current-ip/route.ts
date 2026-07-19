import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { AppError } from '@services/AuthService';
import { apiError, success } from '@lib/utils/api-response';
import { getClientIp } from '@mw/rateLimiter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getAuthUser(request);
    assertRole(payload, 'admin');
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }

  const ip = getClientIp(request);
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp    = request.headers.get('x-real-ip');
  const source    = forwarded ? 'x-forwarded-for' : realIp ? 'x-real-ip' : 'local';

  return success({ currentIp: ip, source }, 200);
}
