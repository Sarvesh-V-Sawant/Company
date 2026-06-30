import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function DELETE(_r: NextRequest): Promise<NextResponse> {
  return apiError('GEN_004', 'Payroll month locking not implemented.', 501);
}
