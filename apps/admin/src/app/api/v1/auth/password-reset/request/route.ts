import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ForgotPasswordSchema } from '@validators/auth';
import { AuthService } from '@services/AuthService';
import { passwordResetLimiter, getClientIp } from '@mw/rateLimiter';
import { success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

const ALWAYS_OK = { message: 'If that email is registered, a reset link has been sent.' };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  // PHASE 15.19 DIAGNOSTIC — remove after runtime trace captured
  console.log(`[DIAG][FP-ROUTE] POST /password-reset/request  ip=${ip}`);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.log('[DIAG][FP-ROUTE] JSON parse failed → ALWAYS_OK');
    return success(ALWAYS_OK);
  }

  let parsed;
  try {
    parsed = ForgotPasswordSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      console.log('[DIAG][FP-ROUTE] Zod validation failed → ALWAYS_OK');
      return success(ALWAYS_OK);
    }
    throw err;
  }

  console.log(`[DIAG][FP-ROUTE] email=${parsed.email}  checking rate limits...`);
  const emailKey = `email:${parsed.email.toLowerCase()}`;
  const ipKey = `ip:${ip}`;

  const [emailCheck, ipCheck] = await Promise.all([
    passwordResetLimiter.limit(emailKey),
    passwordResetLimiter.limit(ipKey),
  ]);

  console.log(`[DIAG][FP-ROUTE] emailLimit: success=${emailCheck.success} remaining=${emailCheck.remaining} reset=${new Date(emailCheck.reset).toISOString()}`);
  console.log(`[DIAG][FP-ROUTE] ipLimit:    success=${ipCheck.success}    remaining=${ipCheck.remaining}    reset=${new Date(ipCheck.reset).toISOString()}`);

  if (!emailCheck.success || !ipCheck.success) {
    console.log('[DIAG][FP-ROUTE] Rate limit exceeded → ALWAYS_OK (no token created, no email sent)');
    return success(ALWAYS_OK);
  }

  console.log('[DIAG][FP-ROUTE] Rate limits OK. Calling AuthService.requestPasswordReset()');
  try {
    await AuthService.requestPasswordReset(parsed.email, ip);
    console.log('[DIAG][FP-ROUTE] AuthService.requestPasswordReset() completed');
  } catch (err) {
    console.error('[DIAG][FP-ROUTE] AuthService.requestPasswordReset() threw (swallowed):', err);
  }

  console.log('[DIAG][FP-ROUTE] Returning ALWAYS_OK');
  return success(ALWAYS_OK);
}
