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

// 30/min per IP — allows multi-user office scenarios, blocks token-refresh floods
export const refreshLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:refresh',
});

// 20/hr per userId — prevents regularization submission spam
export const regularizationLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  prefix: 'rl:reg',
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
  let result: Awaited<ReturnType<typeof limiter.limit>>;
  try {
    result = await limiter.limit(key);
  } catch {
    // Upstash unavailable — fail-open to preserve availability
    return null;
  }
  if (!result.success) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
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
