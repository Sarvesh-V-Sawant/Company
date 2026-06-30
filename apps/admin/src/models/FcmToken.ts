import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IFcmToken extends Document {
  employeeId: mongoose.Types.ObjectId;
  token: string;
  deviceId: string;
  platform: 'android' | 'ios';
  isActive: boolean;
  lastRefreshedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FcmTokenSchema = new Schema<IFcmToken>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    deviceId: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios'], required: true },
    isActive: { type: Boolean, required: true, default: true },
    lastRefreshedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

FcmTokenSchema.index({ employeeId: 1, isActive: 1 });
FcmTokenSchema.index({ deviceId: 1 });
FcmTokenSchema.index({ lastRefreshedAt: 1 }, { expireAfterSeconds: 7_776_000 });

export const FcmToken: Model<IFcmToken> =
  (mongoose.models['FcmToken'] as Model<IFcmToken>) ??
  mongoose.model<IFcmToken>('FcmToken', FcmTokenSchema);
