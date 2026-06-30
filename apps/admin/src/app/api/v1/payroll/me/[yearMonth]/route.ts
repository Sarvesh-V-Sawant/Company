import { NextRequest, NextResponse } from 'next/server';
import { PayrollService } from '@services/PayrollService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError, success } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ yearMonth: string }> },
): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  const { yearMonth } = await context.params;

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return apiError('GEN_001', 'Invalid yearMonth format. Use YYYY-MM.', 400);
  }

  try {
    const result = await PayrollService.getOwnByYearMonth({ userId: payload.userId, yearMonth });
    return success(result, 200);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
