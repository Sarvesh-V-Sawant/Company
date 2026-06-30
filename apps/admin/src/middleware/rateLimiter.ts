import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@lib/redis/client';
import { NextRequest, NextResponse } from 'next/server';

export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'rl:auth',
});

export const passwordResetLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:pwd-reset',
});

export const attendanceLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:attendance',
});

export const deviceRequestLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '24 h'),
  prefix: 'rl:device-req',
});

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export async function checkRateLimit(
  limiter: Ratelimit,
  key: string,
): Promise<NextResponse | null> {
  const { success, reset } = await limiter.limit(key);
  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      { success: false, error: { code: 'GEN_003', message: 'Rate limit exceeded.' } },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }
  return null;
}
