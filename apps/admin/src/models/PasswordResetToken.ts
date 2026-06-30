import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IPasswordResetToken extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  isUsed: boolean;
  usedAt?: Date;
  ipAddress: string;
  createdAt: Date;
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    isUsed: { type: Boolean, required: true, default: false },
    usedAt: { type: Date },
    ipAddress: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PasswordResetTokenSchema.index({ userId: 1 });
PasswordResetTokenSchema.index({ tokenHash: 1 });
PasswordResetTokenSchema.index({ email: 1 });

export const PasswordResetToken: Model<IPasswordResetToken> =
  (mongoose.models['PasswordResetToken'] as Model<IPasswordResetToken>) ??
  mongoose.model<IPasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema);
