import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  return apiError('GEN_004', 'Not implemented.', 501);
}
