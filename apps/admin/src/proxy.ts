import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, errors as joseErrors } from 'jose';

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/password-reset/confirm',
  '/api/v1/auth/device-request',
];

const PASSWORD_CHANGE_ALLOWED = [
  '/change-password',
  '/api/v1/auth/me/change-password',
  '/api/v1/auth/logout',
  '/api/v1/auth/me',
];

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|cron|admin\\/cron|health).*)'],
};

async function verifyJwt(token: string) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
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
      return payload;
    }
    throw err;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check __session cookie (set on login/refresh) for page routes;
  // fall back to Authorization header for API routes.
  const token =
    request.cookies.get('__session')?.value ??
    request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    if (isApi) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_003', message: 'Unauthorized.' } },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = await verifyJwt(token);

    if (
      payload.requiresPasswordChange &&
      !PASSWORD_CHANGE_ALLOWED.some((p) => pathname.startsWith(p))
    ) {
      if (isApi) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'AUTH_010', message: 'Password change required.' },
          },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL('/change-password', request.url));
    }

    if (!isApi && payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    if (process.env.MAINTENANCE_MODE === 'true' && !isApi) {
      return NextResponse.rewrite(new URL('/maintenance.html', request.url));
    }

    return NextResponse.next();
  } catch {
    if (isApi) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_003', message: 'Unauthorized.' } },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
