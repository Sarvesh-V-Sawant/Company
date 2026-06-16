export type DayStatus =
  | 'present'
  | 'absent'
  | 'half-day'
  | 'leave'
  | 'holiday'
  | 'weekend'
  | 'lwp'
  | 'not-applicable';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked';

export type RegularizationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type PayrollStatus = 'draft' | 'finalised';

export type UserRole = 'admin' | 'employee';
