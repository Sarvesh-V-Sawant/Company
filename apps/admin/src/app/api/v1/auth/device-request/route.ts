import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { SubmitDeviceRequestSchema } from '@validators/device';
import { DeviceService } from '@services/DeviceService';
import { AppError } from '@services/AuthService';
import { apiError, success } from '@lib/utils/api-response';
import { authLimiter, deviceRequestLimiter, checkRateLimit, getClientIp } from '@mw/rateLimiter';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);

  const authLimit = await checkRateLimit(authLimiter, `ip:${ip}`);
  if (authLimit) return authLimit;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('GEN_001', 'Invalid JSON body.', 400);
  }

  let parsed;
  try {
    parsed = SubmitDeviceRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  const emailLimit = await checkRateLimit(deviceRequestLimiter, `email:${parsed.email}`);
  if (emailLimit) return emailLimit;
  const ipLimit = await checkRateLimit(deviceRequestLimiter, `ip:${ip}`);
  if (ipLimit) return ipLimit;

  try {
    const result = await DeviceService.submitRequest({ ...parsed, requestIp: ip });
    const status = result.status === 'already_approved' ? 200 : 201;
    return success(result, status);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
