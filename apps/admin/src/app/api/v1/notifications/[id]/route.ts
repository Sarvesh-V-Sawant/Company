import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(_r: NextRequest): Promise<NextResponse> {
  return apiError('GEN_004', 'Not implemented.', 501);
}
