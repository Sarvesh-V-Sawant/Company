import { NextRequest, NextResponse } from 'next/server';
import { AuthService, AppError } from '@services/AuthService';

export const dynamic = 'force-dynamic';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { success, apiError } from '@lib/utils/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try {
    payload = await getAuthUser(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }

  try {
    const data = await AuthService.getMe(payload.userId);
    return success(data);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}

export async function PATCH(): Promise<NextResponse> {
  return apiError('GEN_004', 'Not implemented.', 501);
}
