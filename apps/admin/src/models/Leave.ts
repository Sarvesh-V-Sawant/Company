import mongoose, { Document, Model, Schema } from 'mongoose';

export type LeaveType      = 'paidLeave' | 'sickLeave' | 'casualLeave' | 'lwp';
export type LeaveDuration  = 'full' | 'half';
export type HalfDayPeriod  = 'morning' | 'afternoon';
export type LeaveStatus    = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked' | 'withdrawn';

export interface ILeave extends Document {
  employeeId: mongoose.Types.ObjectId;
  leaveType: LeaveType;
  duration: LeaveDuration;
  halfDayPeriod?: HalfDayPeriod;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  leaveYear: number;
  reason: string;
  remarks?: string;
  status: LeaveStatus;

  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewRemarks?: string;

  revokedBy?: mongoose.Types.ObjectId;
  revokedAt?: Date;
  revocationReason?: string;

  withdrawnBy?: mongoose.Types.ObjectId;
  withdrawnAt?: Date;
  withdrawalReason?: string;

  affectedDates: string[];

  createdAt: Date;
  updatedAt: Date;
}

const LeaveSchema = new Schema<ILeave>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType:     { type: String, enum: ['paidLeave','sickLeave','casualLeave','lwp'], required: true },
    duration:      { type: String, enum: ['full','half'], required: true },
    halfDayPeriod: { type: String, enum: ['morning','afternoon'] },
    startDate:     { type: Date, required: true },
    endDate:    { type: Date, required: true },
    totalDays:  { type: Number, required: true, min: 0.5 },
    leaveYear:  { type: Number, required: true },

    reason:   { type: String, required: true, trim: true, maxlength: 500 },
    remarks:  { type: String, trim: true, maxlength: 1000 },

    status: {
      type: String,
      enum: ['pending','approved','rejected','cancelled','revoked','withdrawn'],
      required: true,
      default: 'pending',
    },

    reviewedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:    Date,
    reviewRemarks: { type: String, trim: true, maxlength: 500 },

    revokedBy:        { type: Schema.Types.ObjectId, ref: 'User' },
    revokedAt:        Date,
    revocationReason: { type: String, trim: true, maxlength: 500 },

    withdrawnBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    withdrawnAt:      Date,
    withdrawalReason: { type: String, trim: true, maxlength: 500 },

    affectedDates: { type: [String], required: true, default: [] },
  },
  { timestamps: true },
);

LeaveSchema.index({ employeeId: 1, status: 1 });
LeaveSchema.index({ employeeId: 1, leaveYear: 1, status: 1 });
LeaveSchema.index({ employeeId: 1, startDate: -1 });
LeaveSchema.index({ status: 1, createdAt: -1 });
LeaveSchema.index({ affectedDates: 1 });
LeaveSchema.index({ employeeId: 1, status: 1, startDate: 1, endDate: 1 });

export const Leave: Model<ILeave> =
  (mongoose.models['Leave'] as Model<ILeave>) ??
  mongoose.model<ILeave>('Leave', LeaveSchema);
