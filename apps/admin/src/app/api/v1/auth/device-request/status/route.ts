import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { GetDeviceRequestStatusSchema } from '@validators/device';
import { DeviceService } from '@services/DeviceService';
import { apiError, success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  let parsed;
  try {
    parsed = GetDeviceRequestStatusSchema.parse(Object.fromEntries(searchParams));
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  // Always 200 — status may be not_found|pending|approved|rejected (prevents enumeration)
  const result = await DeviceService.getRequestStatus(parsed.email, parsed.deviceFingerprint);
  return success(result);
}
