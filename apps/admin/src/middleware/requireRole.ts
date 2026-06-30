import type { JwtPayload } from '@app-types/jwt';
import { AuthError } from './requireAuth';

export function assertRole(payload: JwtPayload, ...roles: Array<'admin' | 'employee'>): void {
  if (!roles.includes(payload.role)) {
    throw new AuthError('AUTH_006', 403);
  }
}
