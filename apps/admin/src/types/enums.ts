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

export type RegularizationType =
  | 'forgotCheckIn'
  | 'forgotCheckOut'
  | 'workAwayFromOffice'
  | 'officialTravel'
  | 'clientVisit';

export type PayrollStatus = 'draft' | 'finalised';

export type UserRole = 'admin' | 'employee';

export type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type LeaveTypeCode = 'CL' | 'SL' | 'PL' | 'CO' | 'LWP';
