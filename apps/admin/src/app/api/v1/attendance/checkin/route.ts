import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { CheckInSchema } from '@validators/attendance';
import { AttendanceService } from '@services/AttendanceService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError, success } from '@lib/utils/api-response';
import { attendanceLimiter, checkRateLimit } from '@mw/rateLimiter';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload;
  try {
    payload = await getAuthUser(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  const limitResponse = await checkRateLimit(attendanceLimiter, payload.userId);
  if (limitResponse) return limitResponse;

  const deviceFingerprintHeader = request.headers.get('X-Device-Fingerprint') ?? '';

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('GEN_001', 'Invalid JSON body.', 400);
  }

  let parsed;
  try {
    parsed = CheckInSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  try {
    const result = await AttendanceService.checkIn({
      employeeId: payload.userId,
      deviceFingerprintHeader,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      accuracy: parsed.accuracy,
      nonce: parsed.nonce,
      clientTimestamp: parsed.timestamp,
    });
    return success(result);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
