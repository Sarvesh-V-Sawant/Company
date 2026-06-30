import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IUsedNonce extends Document {
  nonce: string;
  employeeId: mongoose.Types.ObjectId;
  action: 'checkin' | 'checkout';
  usedAt: Date;
}

const UsedNonceSchema = new Schema<IUsedNonce>(
  {
    nonce:      { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action:     { type: String, enum: ['checkin', 'checkout'], required: true },
    usedAt:     { type: Date, required: true, default: Date.now },
  },
  { timestamps: false },
);

UsedNonceSchema.index({ nonce: 1 }, { unique: true });
UsedNonceSchema.index({ usedAt: 1 }, { expireAfterSeconds: 600 }); // TTL 10 minutes

export const UsedNonce: Model<IUsedNonce> =
  (mongoose.models['UsedNonce'] as Model<IUsedNonce>) ??
  mongoose.model<IUsedNonce>('UsedNonce', UsedNonceSchema);
