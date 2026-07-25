import type { UserRole } from './enums';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  requiresPasswordChange: boolean;
  iat: number;
  exp: number;
}
