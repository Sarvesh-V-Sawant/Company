export const AUTH_ERRORS = {
  AUTH_001: 'Invalid credentials',
  AUTH_002: 'Account not found',
  AUTH_003: 'Token expired',
  AUTH_004: 'Token invalid',
  AUTH_005: 'Refresh token expired',
  AUTH_006: 'Password too weak',
  AUTH_007: 'Current password incorrect',
  AUTH_008: 'Reset token invalid or expired',
  AUTH_009: 'Device not registered',
  AUTH_010: 'Device fingerprint mismatch',
  AUTH_011: 'Password change required',
} as const;

export const ATT_ERRORS = {
  ATT_001: 'Already checked in today',
  ATT_002: 'No active session',
  ATT_003: 'Outside geofence',
  ATT_004: 'Duplicate request',
  ATT_005: 'Attendance record not found',
} as const;

export const LEAVE_ERRORS = {
  LEAVE_001: 'Insufficient leave balance',
  LEAVE_002: 'Leave dates conflict',
  LEAVE_003: 'Leave not found',
  LEAVE_004: 'Leave cannot be cancelled in current state',
  LEAVE_005: 'Leave year not initialized',
} as const;

export const PAY_ERRORS = {
  PAY_001: 'Payroll already finalised',
  PAY_002: 'Payroll not found',
  PAY_003: 'Payroll compute in progress',
  PAY_004: 'Manual deduction requires remark',
} as const;
