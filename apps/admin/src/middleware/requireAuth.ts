import { jwtVerify, errors as joseErrors } from 'jose';
import { NextRequest } from 'next/server';
import type { JwtPayload } from '@app-types/jwt';

export class AuthError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
  ) {
    super(code);
  }
}

async function verifyToken(token: string): Promise<JwtPayload> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JwtPayload;
  } catch (err) {
    // During key rotation, accept tokens signed with the previous secret
    const prevSecret = process.env.JWT_SECRET_PREVIOUS;
    if (
      prevSecret &&
      (err instanceof joseErrors.JWSSignatureVerificationFailed ||
        err instanceof joseErrors.JWTExpired)
    ) {
      const prevKey = new TextEncoder().encode(prevSecret);
      const { payload } = await jwtVerify(token, prevKey);
      return payload as unknown as JwtPayload;
    }
    throw err;
  }
}

export async function getAuthUser(request: NextRequest): Promise<JwtPayload> {
  const authHeader = request.headers.get('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = request.cookies.get('__session')?.value;
  }

  if (!token) throw new AuthError('AUTH_003', 401);

  try {
    return await verifyToken(token);
  } catch {
    throw new AuthError('AUTH_003', 401);
  }
}
