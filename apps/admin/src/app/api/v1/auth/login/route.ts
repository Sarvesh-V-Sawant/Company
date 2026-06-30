import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { LoginSchema } from '@validators/auth';

export const dynamic = 'force-dynamic';
import { AuthService, AppError } from '@services/AuthService';
import { authLimiter, getClientIp, checkRateLimit } from '@mw/rateLimiter';
import { success, apiError } from '@lib/utils/api-response';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes — matches JWT expiry

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const limited = await checkRateLimit(authLimiter, ip);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('GEN_001', 'Invalid JSON body.', 400);
  }

  let parsed;
  try {
    parsed = LoginSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return apiError('GEN_001', 'Validation failed.', 400);
    }
    throw err;
  }

  try {
    const result = await AuthService.login(
      parsed.email,
      parsed.password,
      parsed.deviceFingerprint,
      ip,
      request.headers.get('user-agent') ?? '',
    );
    const res = success(result);
    // Set __session cookie so Edge Middleware can validate page-route access
    res.cookies.set('__session', result.accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code, err.message, err.httpStatus);
    }
    throw err;
  }
}
