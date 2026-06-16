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
  const perDaySalary =
    input.effectiveWorkingDays > 0 ? input.grossSalary / input.effectiveWorkingDays : 0;

  const lwpDeduction = Math.round(input.effectiveLwpDays * perDaySalary * 100) / 100;
  const absentDeduction = Math.round(input.absentDays * perDaySalary * 100) / 100;
  const attendanceDeduction = lwpDeduction + absentDeduction;
  const totalDeductions = attendanceDeduction + input.manualDeduction;
  const netSalary = Math.round(Math.max(0, input.grossSalary - totalDeductions) * 100) / 100;

  return { perDaySalary, lwpDeduction, absentDeduction, attendanceDeduction, totalDeductions, netSalary };
}
