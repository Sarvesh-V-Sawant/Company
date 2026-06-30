import mongoose, { Document, Model, Schema } from 'mongoose';

export type RevokedReason = 'logout' | 'admin-reset' | 'device-change' | 'expired';

export interface IDeviceSession extends Document {
  employeeId: mongoose.Types.ObjectId;
  refreshTokenHash: string;
  deviceFingerprint: string | null;
  deviceInfo: string;
  platform: 'android' | 'ios' | 'web';
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: RevokedReason;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  lastUsedAt: Date;
  ipAddressHash: string;
  createdAt: Date;
}

const DeviceSessionSchema = new Schema<IDeviceSession>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true },
    deviceFingerprint: { type: String, required: false, default: null },
    deviceInfo: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], required: true },
    isRevoked: { type: Boolean, required: true, default: false },
    revokedAt: { type: Date },
    revokedReason: {
      type: String,
      enum: ['logout', 'admin-reset', 'device-change', 'expired'],
    },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true, default: Date.now },
    ipAddressHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

DeviceSessionSchema.index({ employeeId: 1, isRevoked: 1 });
DeviceSessionSchema.index({ refreshTokenHash: 1 });
DeviceSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DeviceSession: Model<IDeviceSession> =
  (mongoose.models['DeviceSession'] as Model<IDeviceSession>) ??
  mongoose.model<IDeviceSession>('DeviceSession', DeviceSessionSchema);
