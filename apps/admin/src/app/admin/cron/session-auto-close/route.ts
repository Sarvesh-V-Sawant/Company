import { NextRequest, NextResponse } from 'next/server';

// Manual admin trigger — auth handled by src/middleware.ts
export async function POST(_request: NextRequest) {
  return NextResponse.json({ success: true, jobName: 'session-auto-close', triggeredAt: new Date().toISOString() });
}
