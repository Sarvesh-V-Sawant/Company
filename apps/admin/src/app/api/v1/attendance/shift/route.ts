import { NextRequest, NextResponse } from 'next/server';
import { SettingsService } from '@services/SettingsService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError, success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Employee-safe: any authenticated user may read shift times for reminder scheduling.
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await getAuthUser(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  try {
    const s = await SettingsService.getSettings();
    // Derive required minutes from shift window — no separate break/lunch field exists.
    // Stored requiredDailyMinutes is not authoritative; shift times are.
    const derivedRequired = timeToMinutes(s.workEndTime) - timeToMinutes(s.workStartTime);
    return success({
      shiftStart:               s.workStartTime,
      shiftEnd:                 s.workEndTime,
      gracePeriodMinutes:       s.lateArrivalGraceMinutes,
      requiredDailyMinutes:     derivedRequired > 0 ? derivedRequired : s.requiredDailyMinutes,
      halfDayThresholdMinutes:  s.halfDayThresholdMinutes,
    }, 200);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
