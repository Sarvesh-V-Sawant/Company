import { redis } from './client';

const TTL_SECONDS = 86400;

export async function checkIdempotency(key: string): Promise<string | null> {
  return redis.get<string>(`idem:${key}`);
}

export async function setIdempotency(key: string, responseBody: string): Promise<void> {
  await redis.set(`idem:${key}`, responseBody, { ex: TTL_SECONDS });
}
