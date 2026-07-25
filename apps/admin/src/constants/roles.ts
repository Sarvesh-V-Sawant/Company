import type { UserRole } from '@app-types/enums';

export const ROLES = {
  SUPER_ADMIN: 'super_admin' as UserRole,
  ADMIN:       'admin'       as UserRole,
  MANAGER:     'manager'     as UserRole,
  EXECUTIVE:   'executive'   as UserRole,
  EMPLOYEE:    'employee'    as UserRole,
};

export const WORK_DESK_ROLES: UserRole[] = ['super_admin', 'admin', 'manager', 'executive', 'employee'];
export const ATTENDANCE_ADMIN_ROLES: UserRole[] = ['super_admin', 'admin'];
export const CHAIN_APPROVE_ROLES: UserRole[] = ['super_admin', 'admin', 'manager'];
