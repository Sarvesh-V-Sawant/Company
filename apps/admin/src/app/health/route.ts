import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { redis } from '@lib/redis/client';

export async function GET() {
  const db = mongoose.connection.readyState === 1 ? 'ok' : 'disconnected';

  let redisStatus = 'ok';
  try {
    await redis.ping();
  } catch {
    redisStatus = 'error';
  }

  const status = db === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';
  const httpStatus = status === 'ok' ? 200 : 503;

  return NextResponse.json({ status, db, redis: redisStatus }, { status: httpStatus });
}
