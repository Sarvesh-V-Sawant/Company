import { NextRequest, NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { AttendanceService } from '@services/AttendanceService';
import { CompanySettings } from '@models/CompanySettings';
import type { ICompanySettings } from '@models/CompanySettings';
import { SystemEvent } from '@models/SystemEvent';
import { connectDB } from '@lib/db/connect';
import { CRON_NAMES } from '@constants/cron-names';
import { assertCronAuth } from '@mw/cronGuard';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  await connectDB();

  const settings = await CompanySettings.findById('company-settings').lean() as ICompanySettings | null;
  const timezone = settings?.timezone ?? 'Asia/Kolkata';

  // Close sessions for yesterday (previous calendar day in company timezone)
  const yesterday = new Date(Date.now() - 86_400_000);
  const dateString = formatInTimeZone(yesterday, timezone, 'yyyy-MM-dd');

  // Idempotency guard — skip if already completed for this date
  const existing = await SystemEvent.findOne({
    eventType: CRON_NAMES.SESSION_AUTO_CLOSE,
    date: dateString,
    status: 'completed',
  }).lean();

  if (existing) {
    return NextResponse.json({
      success: true,
      jobName: CRON_NAMES.SESSION_AUTO_CLOSE,
      skipped: true,
      reason: 'already-completed',
      dateString,
    });
  }

  const { closed } = await AttendanceService.autoCloseSessions(dateString);

  await SystemEvent.create({
    eventType: CRON_NAMES.SESSION_AUTO_CLOSE,
    date: dateString,
    status: 'completed',
    completedAt: new Date(),
    meta: { sessionsClosed: closed },
  });

  return NextResponse.json({
    success: true,
    jobName: CRON_NAMES.SESSION_AUTO_CLOSE,
    triggeredAt: new Date().toISOString(),
    dateString,
    sessionsClosed: closed,
  });
}
