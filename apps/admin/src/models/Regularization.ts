import mongoose, { Document, Schema } from 'mongoose';
import type { RegularizationStatus, RegularizationType } from '@app-types/enums';

export interface IRegularization extends Document {
  employeeId: mongoose.Types.ObjectId;
  dateString: string;
  type: RegularizationType;
  requestedCheckIn?: Date;
  requestedCheckOut?: Date;
  reason: string;
  status: RegularizationStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewRemark?: string;
  attendanceDayId?: mongoose.Types.ObjectId;
  withdrawnAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RegularizationSchema = new Schema<IRegularization>(
  {
    employeeId:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dateString:       { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    type:             { type: String, enum: ['forgotCheckIn','forgotCheckOut','workAwayFromOffice','officialTravel','clientVisit'], required: true },
    requestedCheckIn:  { type: Date },
    requestedCheckOut: { type: Date },
    reason:           { type: String, required: true, maxlength: 500 },
    status:           { type: String, enum: ['pending','approved','rejected','withdrawn'], default: 'pending' },
    reviewedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:       Date,
    reviewRemark:     String,
    attendanceDayId:  { type: Schema.Types.ObjectId, ref: 'AttendanceDay' },
    withdrawnAt:      Date,
  },
  { timestamps: true },
);

// One active (pending/approved) request per employee per date
RegularizationSchema.index({ employeeId: 1, dateString: 1, status: 1 });
RegularizationSchema.index({ employeeId: 1, status: 1 });
RegularizationSchema.index({ status: 1, createdAt: -1 });

export const Regularization =
  mongoose.models.Regularization ??
  mongoose.model<IRegularization>('Regularization', RegularizationSchema);
