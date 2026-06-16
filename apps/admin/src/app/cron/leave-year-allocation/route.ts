import { NextRequest, NextResponse } from 'next/server';
import { validateCronSecret } from '@lib/utils/cron-guard';

export async function POST(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ success: true, jobName: 'leave-year-allocation', executedAt: new Date().toISOString() });
}
