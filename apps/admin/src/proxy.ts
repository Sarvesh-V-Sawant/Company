import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, errors as joseErrors } from 'jose';
import { WORK_DESK_ROLES, ATTENDANCE_ADMIN_ROLES } from '@constants/roles';
import type { UserRole } from '@app-types/enums';

// Any authenticated role may reach these — no per-role restriction.
const ANY_AUTHENTICATED_PATHS = ['/', '/dashboard', '/profile', '/notifications', '/change-password'];

// Ordered most-specific-first; first matching prefix wins. Anything that
// matches no prefix here is default-denied (see proxy() below) — a new page
// must be added here explicitly, it is never silently public.
const PAGE_ROLE_MAP: { prefix: string; roles: UserRole[] }[] = [
  { prefix: '/desk', roles: WORK_DESK_ROLES },
  { prefix: '/settings', roles: ATTENDANCE_ADMIN_ROLES },
  { prefix: '/attendance', roles: ATTENDANCE_ADMIN_ROLES },
  { prefix: '/payroll', roles: ATTENDANCE_ADMIN_ROLES },
  // Remaining HR/admin pages — same admin-only posture as settings/attendance/
  // payroll above (this is what the pre-regression blanket admin-only gate
  // already enforced for these; kept as-is, not part of the Work Desk fix).
  { prefix: '/employees', roles: ATTENDANCE_ADMIN_ROLES },
  { prefix: '/leave', roles: ATTENDANCE_ADMIN_ROLES },
  { prefix: '/regularization', roles: ATTENDANCE_ADMIN_ROLES },
  { prefix: '/reports', roles: ATTENDANCE_ADMIN_ROLES },
  { prefix: '/devices', roles: ATTENDANCE_ADMIN_ROLES },
  { prefix: '/audit-logs', roles: ATTENDANCE_ADMIN_ROLES },
];

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/unauthorized',
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

    // Page-level role authorization. API routes are gated separately by each
    // route's own assertRole check (data-level); this gates which PAGES a role
    // may load at all, independent of whether the data calls on that page 403.
    if (!isApi && !ANY_AUTHENTICATED_PATHS.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)))) {
      const rule = PAGE_ROLE_MAP.find((r) => pathname.startsWith(r.prefix));
      const role = payload.role as UserRole;
      if (!rule || !rule.roles.includes(role)) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
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
