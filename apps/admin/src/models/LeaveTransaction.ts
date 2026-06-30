import mongoose, { Document, Model, Schema } from 'mongoose';

export type LeaveTransactionType =
  | 'annual-allocation'
  | 'pro-rated-allocation'
  | 'carry-forward-credit'
  | 'carry-forward-expiry'
  | 'deduction-approval'
  | 'restoration-rejection'
  | 'restoration-cancellation'
  | 'restoration-revocation'
  | 'restoration-withdrawal'
  | 'manual-adjustment';

export interface ILeaveTransaction extends Document {
  employeeId: mongoose.Types.ObjectId;
  leaveType: 'paidLeave' | 'sickLeave' | 'casualLeave';
  leaveYear: number;

  transactionType: LeaveTransactionType;
  days: number;

  balanceAfterCurrentYear: number;
  balanceAfterCarriedForward: number;

  referenceType?: 'leaveRequest' | 'leaveYearAllocation' | 'manual';
  referenceId?: mongoose.Types.ObjectId;

  note?: string;
  performedBy: mongoose.Types.ObjectId | string;
  timestamp: Date;
}

const LeaveTransactionSchema = new Schema<ILeaveTransaction>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType:  { type: String, enum: ['paidLeave','sickLeave','casualLeave'], required: true },
    leaveYear:  { type: Number, required: true },

    transactionType: {
      type: String,
      enum: [
        'annual-allocation','pro-rated-allocation','carry-forward-credit',
        'carry-forward-expiry','deduction-approval','restoration-rejection',
        'restoration-cancellation','restoration-revocation','restoration-withdrawal',
        'manual-adjustment',
      ],
      required: true,
    },
    days:                        { type: Number, required: true },
    balanceAfterCurrentYear:     { type: Number, required: true, min: 0 },
    balanceAfterCarriedForward:  { type: Number, required: true, min: 0 },

    referenceType: { type: String, enum: ['leaveRequest','leaveYearAllocation','manual'] },
    referenceId:   { type: Schema.Types.ObjectId },

    note:        { type: String, maxlength: 500 },
    performedBy: { type: Schema.Types.Mixed, required: true },
    timestamp:   { type: Date, required: true, default: Date.now },
  },
  { timestamps: false },
);

// Immutable — balance ledger; all mutation hooks throw
LeaveTransactionSchema.pre('findOneAndUpdate', () => { throw new Error('LeaveTransaction is immutable'); });
LeaveTransactionSchema.pre('updateOne',        () => { throw new Error('LeaveTransaction is immutable'); });
LeaveTransactionSchema.pre('updateMany',       () => { throw new Error('LeaveTransaction is immutable'); });
LeaveTransactionSchema.pre('bulkWrite',        () => { throw new Error('LeaveTransaction is immutable'); });
LeaveTransactionSchema.pre('save', function()  { if (!this.isNew) throw new Error('LeaveTransaction is immutable'); });

LeaveTransactionSchema.index({ employeeId: 1, leaveType: 1, leaveYear: 1, timestamp: -1 });
LeaveTransactionSchema.index({ referenceId: 1 });
LeaveTransactionSchema.index({ employeeId: 1, timestamp: -1 });

export const LeaveTransaction: Model<ILeaveTransaction> =
  (mongoose.models['LeaveTransaction'] as Model<ILeaveTransaction>) ??
  mongoose.model<ILeaveTransaction>('LeaveTransaction', LeaveTransactionSchema);
