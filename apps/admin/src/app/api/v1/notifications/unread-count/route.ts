import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@services/NotificationService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError, success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try {
    payload = await getAuthUser(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  const result = await NotificationService.getUnreadCount(payload.userId);
  return success(result);
}
