import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { NotificationListQuerySchema } from '@validators/notification';
import { NotificationService } from '@services/NotificationService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try {
    payload = await getAuthUser(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  let query;
  try {
    const p = Object.fromEntries(request.nextUrl.searchParams.entries());
    query = NotificationListQuerySchema.parse(p);
  } catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  const result = await NotificationService.list({ userId: payload.userId, query });
  return NextResponse.json({ success: true, ...result });
}
