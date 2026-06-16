import mongoose, { Document, Schema } from 'mongoose';
import type { RegularizationStatus } from '@app-types/enums';

export interface IRegularization extends Document {
  employeeId: mongoose.Types.ObjectId;
  date: string;
  reason: string;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  status: RegularizationStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewRemark?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RegularizationSchema = new Schema<IRegularization>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    requestedCheckIn: String,
    requestedCheckOut: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewRemark: String,
  },
  { timestamps: true },
);

RegularizationSchema.index({ employeeId: 1, date: 1, status: 1 });

export const Regularization =
  mongoose.models.Regularization ??
  mongoose.model<IRegularization>('Regularization', RegularizationSchema);
