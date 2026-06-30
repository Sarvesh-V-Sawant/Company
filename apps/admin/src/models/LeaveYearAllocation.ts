import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IProRationBasis {
  joinDate: Date;
  leaveYearStart: Date;
  totalWorkingDays: number;
  eligibleWorkingDays: number;
}

export interface ILeaveYearAllocation extends Document {
  employeeId: mongoose.Types.ObjectId;
  leaveYear: number;
  leaveType: 'paidLeave' | 'sickLeave' | 'casualLeave';
  allocatedDays: number;
  isProRated: boolean;
  proRationBasis?: IProRationBasis;
  allocatedAt: Date;
  allocatedBy: mongoose.Types.ObjectId | string;
}

const ProRationBasisSchema = new Schema<IProRationBasis>(
  {
    joinDate:             { type: Date, required: true },
    leaveYearStart:       { type: Date, required: true },
    totalWorkingDays:     { type: Number, required: true },
    eligibleWorkingDays:  { type: Number, required: true },
  },
  { _id: false },
);

const LeaveYearAllocationSchema = new Schema<ILeaveYearAllocation>(
  {
    employeeId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    leaveYear:     { type: Number, required: true },
    leaveType:     { type: String, enum: ['paidLeave','sickLeave','casualLeave'], required: true },
    allocatedDays: { type: Number, required: true, min: 0 },
    isProRated:    { type: Boolean, required: true, default: false },
    proRationBasis:{ type: ProRationBasisSchema },
    allocatedAt:   { type: Date, required: true, default: Date.now },
    allocatedBy:   { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: false },
);

// Immutable — allocation records are audit trail (bulkWrite allowed for batch insert)
LeaveYearAllocationSchema.pre('findOneAndUpdate', () => { throw new Error('LeaveYearAllocation is immutable'); });
LeaveYearAllocationSchema.pre('updateOne',        () => { throw new Error('LeaveYearAllocation is immutable'); });
LeaveYearAllocationSchema.pre('updateMany',       () => { throw new Error('LeaveYearAllocation is immutable'); });
LeaveYearAllocationSchema.pre('save', function()  { if (!this.isNew) throw new Error('LeaveYearAllocation is immutable'); });

LeaveYearAllocationSchema.index({ employeeId: 1, leaveYear: 1, leaveType: 1 }, { unique: true });

export const LeaveYearAllocation: Model<ILeaveYearAllocation> =
  (mongoose.models['LeaveYearAllocation'] as Model<ILeaveYearAllocation>) ??
  mongoose.model<ILeaveYearAllocation>('LeaveYearAllocation', LeaveYearAllocationSchema);
