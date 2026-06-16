export const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', daysPerYear: 12, isCarryForward: false },
  { code: 'SL', name: 'Sick Leave', daysPerYear: 6, isCarryForward: false },
  { code: 'PL', name: 'Privilege Leave', daysPerYear: 15, isCarryForward: true, maxCarryForward: 15 },
  { code: 'LWP', name: 'Leave Without Pay', daysPerYear: 0, isCarryForward: false },
] as const;
