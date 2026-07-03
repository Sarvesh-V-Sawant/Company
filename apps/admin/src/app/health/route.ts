import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { redis } from '@lib/redis/client';
import { connectDB } from '@lib/db/connect';

export async function GET() {
  let db: string;
  try {
    await connectDB();
    db = mongoose.connection.readyState === 1 ? 'ok' : 'disconnected';
  } catch {
    db = 'disconnected';
  }

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
