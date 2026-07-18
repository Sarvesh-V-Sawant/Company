export interface PayrollInput {
  grossSalary: number;
  effectiveWorkingDays: number;
  effectiveLwpDays: number;
  absentDays: number;
  manualDeduction: number;
  attendanceHalfDays: number;      // non-LWP half-days from attendance
  halfDayAggregationCount: number; // 0 = disabled; N>=2 = N half-days → 1 deduction day
}

export interface PayrollResult {
  perDaySalary: number;
  lwpDeduction: number;
  absentDeduction: number;
  halfDayDeduction: number;
  halfDayDeductionDays: number;
  attendanceDeduction: number;
  totalDeductions: number;
  netSalary: number;
}

export function computePayroll(input: PayrollInput): PayrollResult {
  if (input.effectiveWorkingDays === 0) {
    return {
      perDaySalary: 0, lwpDeduction: 0, absentDeduction: 0,
      halfDayDeduction: 0, halfDayDeductionDays: 0,
      attendanceDeduction: 0, totalDeductions: 0, netSalary: 0,
    };
  }

  const perDaySalary = input.grossSalary / input.effectiveWorkingDays;

  // Half-day aggregation: N half-days = 1 deduction day; surplus counts as 0.5 each.
  // When disabled (count < 2): attendance half-days produce no direct deduction.
  let halfDayDeductionDays = 0;
  const agg = input.halfDayAggregationCount;
  if (agg >= 2 && input.attendanceHalfDays > 0) {
    const groups  = Math.floor(input.attendanceHalfDays / agg);
    const surplus = input.attendanceHalfDays % agg;
    halfDayDeductionDays = groups + surplus * 0.5;
  }

  const halfDayDeduction    = Math.round(halfDayDeductionDays * perDaySalary * 100) / 100;
  const lwpDeduction        = Math.round(input.effectiveLwpDays * perDaySalary * 100) / 100;
  const absentDeduction     = Math.round(input.absentDays * perDaySalary * 100) / 100;
  const attendanceDeduction = lwpDeduction + absentDeduction + halfDayDeduction;
  const totalDeductions     = attendanceDeduction + input.manualDeduction;
  const netSalary           = Math.round(Math.max(0, input.grossSalary - totalDeductions) * 100) / 100;

  return {
    perDaySalary, lwpDeduction, absentDeduction,
    halfDayDeduction, halfDayDeductionDays,
    attendanceDeduction, totalDeductions, netSalary,
  };
}
