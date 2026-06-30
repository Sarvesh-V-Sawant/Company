import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PayrollMeQuerySchema } from '@validators/payroll';
import { PayrollService } from '@services/PayrollService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = PayrollMeQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }

  try {
    const result = await PayrollService.listForEmployee({ userId: payload.userId, query });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
