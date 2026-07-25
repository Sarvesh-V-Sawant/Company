/** Round a number to 2 decimal places (monetary rounding). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Compute line totals from qty, rate, and GST rate. */
export function computeLineTotal(qty: number, rate: number, gstRatePercent: number): {
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
} {
  const taxableValue = round2(qty * rate);
  const taxAmount = round2(taxableValue * gstRatePercent / 100);
  const lineTotal = round2(taxableValue + taxAmount);
  return { taxableValue, taxAmount, lineTotal };
}

/** Sum an array of monetary values with 2-decimal rounding. */
export function sumMoney(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}
