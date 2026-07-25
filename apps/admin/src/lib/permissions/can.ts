import type { UserRole } from '@app-types/enums';

type Permission =
  | 'chain:view'
  | 'chain:create'
  | 'chain:edit'
  | 'chain:approve'
  | 'chain:cancel'
  | 'chain:assign'
  | 'chain:viewAll'
  | 'master:view'
  | 'master:edit'
  | 'email:send'
  | 'report:view'
  | 'attendance:admin'
  | 'settings:edit';

const PERMISSIONS: Record<Permission, UserRole[]> = {
  'chain:view':       ['super_admin', 'admin', 'manager', 'executive', 'employee'],
  'chain:create':     ['super_admin', 'admin', 'manager', 'executive'],
  'chain:edit':       ['super_admin', 'admin', 'manager', 'executive'],
  'chain:approve':    ['super_admin', 'admin', 'manager'],
  'chain:cancel':     ['super_admin', 'admin', 'manager'],
  'chain:assign':     ['super_admin', 'admin', 'manager'],
  'chain:viewAll':    ['super_admin', 'admin', 'manager'],
  'master:view':      ['super_admin', 'admin', 'manager', 'executive', 'employee'],
  'master:edit':      ['super_admin', 'admin', 'manager'],
  'email:send':       ['super_admin', 'admin', 'manager', 'executive'],
  'report:view':      ['super_admin', 'admin', 'manager'],
  'attendance:admin': ['super_admin', 'admin'],
  'settings:edit':    ['super_admin', 'admin'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role);
}

// Scope helper: executives/employees see only their assigned chains
export function chainScopeFilter(role: UserRole, userId: string): Record<string, unknown> {
  if (can(role, 'chain:viewAll')) return {};
  return { assignedTo: userId };
}
