import mongoose, { Document, Schema } from 'mongoose';

export interface IPayrollLock extends Document {
  yearMonth: string;
  lockedAt:  Date;
  lockedBy:  mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollLockSchema = new Schema<IPayrollLock>(
  {
    yearMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/, unique: true },
    lockedAt:  { type: Date,   required: true },
    lockedBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const PayrollLock =
  mongoose.models.PayrollLock ??
  mongoose.model<IPayrollLock>('PayrollLock', PayrollLockSchema);
