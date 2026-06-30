import { createHash, createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashIpAddress(ip: string): string {
  return createHmac('sha256', process.env.JWT_SECRET ?? 'fallback')
    .update(ip)
    .digest('hex')
    .slice(0, 16);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return nodeTimingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
