import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { RefreshSchema } from '@validators/auth';

export const dynamic = 'force-dynamic';
import { AuthService, AppError } from '@services/AuthService';
import { success, apiError } from '@lib/utils/api-response';
import { refreshLimiter, getClientIp, checkRateLimit } from '@mw/rateLimiter';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(refreshLimiter, getClientIp(request));
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('GEN_001', 'Invalid JSON body.', 400);
  }

  let parsed;
  try {
    parsed = RefreshSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  try {
    const result = await AuthService.refresh(parsed.refreshToken, parsed.sessionId);
    const res = success(result);
    // Rotate __session cookie so Edge Middleware continues to accept page-route requests
    res.cookies.set('__session', result.accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
