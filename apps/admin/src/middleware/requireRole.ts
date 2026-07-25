import type { JwtPayload } from '@app-types/jwt';
import type { UserRole } from '@app-types/enums';
import { AuthError } from './requireAuth';

export function assertRole(payload: JwtPayload, ...roles: UserRole[]): void {
  if (!roles.includes(payload.role)) {
    throw new AuthError('AUTH_006', 403);
  }
}

// Attendance/HR admin roles (backward compatible with existing assertRole('admin') calls)
export function assertAttendanceAdmin(payload: JwtPayload): void {
  assertRole(payload, 'admin', 'super_admin');
}

// Work Desk: super_admin, admin, manager, executive. employee role is Attendance-only.
export function assertWorkDeskAccess(payload: JwtPayload): void {
  assertRole(payload, 'super_admin', 'admin', 'manager', 'executive');
}
