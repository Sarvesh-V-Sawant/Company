import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/v1/auth/login',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
];

const PASSWORD_CHANGE_ALLOWED = ['/change-password', '/api/v1/auth/me/password'];

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api/cron|api/health).*)'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    if (isApi) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);

    if (payload.requiresPasswordChange && !PASSWORD_CHANGE_ALLOWED.some((p) => pathname.startsWith(p))) {
      if (isApi) return NextResponse.json({ success: false, error: 'Password change required' }, { status: 403 });
      return NextResponse.redirect(new URL('/change-password', request.url));
    }

    return NextResponse.next();
  } catch {
    if (isApi) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
