export interface PayrollInput {
  grossSalary: number;
  effectiveWorkingDays: number;
  effectiveLwpDays: number;
  absentDays: number;
  manualDeduction: number;
}

export interface PayrollResult {
  perDaySalary: number;
  lwpDeduction: number;
  absentDeduction: number;
  attendanceDeduction: number;
  totalDeductions: number;
  netSalary: number;
}

export function computePayroll(input: PayrollInput): PayrollResult {
  // Guard: no working days (employee joined and left same non-working day) → E-PAY-11
  if (input.effectiveWorkingDays === 0) {
    return { perDaySalary: 0, lwpDeduction: 0, absentDeduction: 0, attendanceDeduction: 0, totalDeductions: 0, netSalary: 0 };
  }

  const perDaySalary        = input.grossSalary / input.effectiveWorkingDays;
  const lwpDeduction        = Math.round(input.effectiveLwpDays * perDaySalary * 100) / 100;
  const absentDeduction     = Math.round(input.absentDays * perDaySalary * 100) / 100;
  const attendanceDeduction = lwpDeduction + absentDeduction;
  const totalDeductions     = attendanceDeduction + input.manualDeduction;
  const netSalary           = Math.round(Math.max(0, input.grossSalary - totalDeductions) * 100) / 100;

  return { perDaySalary, lwpDeduction, absentDeduction, attendanceDeduction, totalDeductions, netSalary };
}
