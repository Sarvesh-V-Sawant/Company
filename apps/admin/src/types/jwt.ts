export interface JwtPayload {
  userId: string;
  role: 'admin' | 'employee';
  requiresPasswordChange: boolean;
  iat: number;
  exp: number;
}
