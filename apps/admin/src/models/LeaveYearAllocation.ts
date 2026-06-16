import mongoose, { Document, Schema } from 'mongoose';

export interface ILeaveYearAllocation extends Document {
  employeeId: mongoose.Types.ObjectId;
  leaveYear: number;
  leaveTypeCode: string;
  allocated: number;
  used: number;
  carriedForward: number;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveYearAllocationSchema = new Schema<ILeaveYearAllocation>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveYear: { type: Number, required: true },
    leaveTypeCode: { type: String, required: true },
    allocated: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    carriedForward: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LeaveYearAllocationSchema.index({ employeeId: 1, leaveYear: 1, leaveTypeCode: 1 }, { unique: true });

export const LeaveYearAllocation =
  mongoose.models.LeaveYearAllocation ??
  mongoose.model<ILeaveYearAllocation>('LeaveYearAllocation', LeaveYearAllocationSchema);
