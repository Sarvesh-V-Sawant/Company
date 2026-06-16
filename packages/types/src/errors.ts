export type AuthErrorCode =
  | 'AUTH_001' | 'AUTH_002' | 'AUTH_003' | 'AUTH_004' | 'AUTH_005'
  | 'AUTH_006' | 'AUTH_007' | 'AUTH_008' | 'AUTH_009' | 'AUTH_010' | 'AUTH_011';

export type AttErrorCode = 'ATT_001' | 'ATT_002' | 'ATT_003' | 'ATT_004' | 'ATT_005';

export type LeaveErrorCode = 'LEAVE_001' | 'LEAVE_002' | 'LEAVE_003' | 'LEAVE_004' | 'LEAVE_005';

export type PayErrorCode = 'PAY_001' | 'PAY_002' | 'PAY_003' | 'PAY_004';

export type AppErrorCode = AuthErrorCode | AttErrorCode | LeaveErrorCode | PayErrorCode;
