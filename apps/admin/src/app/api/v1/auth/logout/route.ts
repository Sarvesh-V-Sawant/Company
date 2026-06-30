import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { LogoutSchema } from '@validators/auth';

export const dynamic = 'force-dynamic';
import { AuthService, AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { success, apiError } from '@lib/utils/api-response';
import { getClientIp } from '@mw/rateLimiter';

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
    parsed = LogoutSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  const ip = getClientIp(request);
  try {
    await AuthService.logout(
      parsed.sessionId,
      payload.userId,
      ip,
      request.headers.get('user-agent') ?? '',
    );
    const res = success({ message: 'Logged out successfully.' });
    // Clear __session cookie
    res.cookies.set('__session', '', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
    });
    return res;
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
