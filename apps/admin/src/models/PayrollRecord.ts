import mongoose, { Document, Schema } from 'mongoose';
import type { PayrollStatus } from '@app-types/enums';

export interface IEmployeeSnapshot {
  firstName: string;
  lastName: string;
  employeeId: string;
  department?: string;
  designation?: string;
  monthlySalary: number;
}

export interface IDeductionBreakdown {
  lwpDeduction: number;
  absentDeduction: number;
  manualDeduction: number;
  totalDeductions: number;
}

export interface IPayrollRecord extends Document {
  employeeId: mongoose.Types.ObjectId;
  yearMonth: string;
  status: PayrollStatus;
  employeeSnapshot: IEmployeeSnapshot;
  effectiveWorkingDays: number;
  effectivePresentDays: number;
  halfDays: number;
  effectiveLwpDays: number;
  halfDayLwpDays: number;
  paidLeaveDays: number;
  absentDays: number;
  grossSalary: number;
  perDaySalary: number;
  deductionBreakdown: IDeductionBreakdown;
  manualDeduction: number;
  manualDeductionRemark: string;
  netSalary: number;
  staleEmployeeIds: string[];
  computedAt: Date;
  finalisedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollRecordSchema = new Schema<IPayrollRecord>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    yearMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    status: { type: String, enum: ['draft', 'finalised'], default: 'draft' },
    employeeSnapshot: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      employeeId: { type: String, required: true },
      department: String,
      designation: String,
      monthlySalary: { type: Number, required: true, min: 0 },
    },
    effectiveWorkingDays: { type: Number, required: true },
    effectivePresentDays: { type: Number, required: true },
    halfDays: { type: Number, default: 0 },
    effectiveLwpDays: { type: Number, default: 0 },
    halfDayLwpDays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    grossSalary: { type: Number, required: true, min: 0 },
    perDaySalary: { type: Number, required: true, min: 0 },
    deductionBreakdown: {
      lwpDeduction: { type: Number, required: true, min: 0 },
      absentDeduction: { type: Number, required: true, min: 0 },
      manualDeduction: { type: Number, default: 0, min: 0 },
      totalDeductions: { type: Number, required: true, min: 0 },
    },
    manualDeduction: { type: Number, default: 0, min: 0 },
    manualDeductionRemark: { type: String, default: '' },
    netSalary: { type: Number, required: true, min: 0 },
    staleEmployeeIds: [{ type: String }],
    computedAt: { type: Date, required: true },
    finalisedAt: Date,
  },
  { timestamps: true },
);

PayrollRecordSchema.index({ employeeId: 1, yearMonth: 1 }, { unique: true });

export const PayrollRecord =
  mongoose.models.PayrollRecord ??
  mongoose.model<IPayrollRecord>('PayrollRecord', PayrollRecordSchema);
