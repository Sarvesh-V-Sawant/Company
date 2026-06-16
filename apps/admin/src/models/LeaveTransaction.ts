import mongoose, { Document, Schema } from 'mongoose';

export interface ILeaveTransaction extends Document {
  employeeId: mongoose.Types.ObjectId;
  leaveTypeCode: string;
  leaveYear: number;
  delta: number;
  reason: string;
  referenceId?: string;
  createdAt: Date;
}

const LeaveTransactionSchema = new Schema<ILeaveTransaction>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveTypeCode: { type: String, required: true },
    leaveYear: { type: Number, required: true },
    delta: { type: Number, required: true },
    reason: { type: String, required: true },
    referenceId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

LeaveTransactionSchema.index({ employeeId: 1, leaveTypeCode: 1, createdAt: -1 });

export const LeaveTransaction =
  mongoose.models.LeaveTransaction ??
  mongoose.model<ILeaveTransaction>('LeaveTransaction', LeaveTransactionSchema);
