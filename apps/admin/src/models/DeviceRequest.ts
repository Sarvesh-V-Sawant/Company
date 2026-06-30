import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeviceRequest extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  fingerprintHash: string;
  deviceName: string;
  manufacturer: string;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
  buildNumber: string;
  timezone: string;
  language: string;
  screenResolution: string;
  batteryLevel?: number;
  requestIp: string;
  platform: 'android' | 'ios';
  status: 'pending' | 'approved' | 'rejected';
  type: 'first_device' | 'replacement';
  requestedAt: Date;
  expiresAt: Date;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  approvalNote?: string;
  rejectionReason?: string;
  requestCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceRequestSchema = new Schema<IDeviceRequest>(
  {
    userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email:            { type: String, required: true, lowercase: true, trim: true },
    fingerprintHash:  { type: String, required: true },
    deviceName:       { type: String, required: true, maxlength: 100 },
    manufacturer:     { type: String, required: true, maxlength: 100 },
    deviceModel:      { type: String, required: true, maxlength: 100 },
    androidVersion:   { type: String, required: true, maxlength: 20 },
    appVersion:       { type: String, required: true, maxlength: 20 },
    buildNumber:      { type: String, required: true, maxlength: 20 },
    timezone:         { type: String, required: true, maxlength: 50 },
    language:         { type: String, required: true, maxlength: 20 },
    screenResolution: { type: String, required: true, maxlength: 30 },
    batteryLevel:     { type: Number, min: 0, max: 100 },
    requestIp:        { type: String, required: true },
    platform:         { type: String, enum: ['android', 'ios'], required: true },
    status:           { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    type:             { type: String, enum: ['first_device', 'replacement'], required: true },
    requestedAt:      { type: Date, default: Date.now },
    expiresAt:        { type: Date, required: true },
    reviewedAt:       { type: Date },
    reviewedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
    approvalNote:     { type: String, maxlength: 500 },
    rejectionReason:  { type: String, maxlength: 500 },
    requestCount:     { type: Number, default: 1 },
  },
  { timestamps: true },
);

DeviceRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
DeviceRequestSchema.index({ userId: 1, status: 1 });
DeviceRequestSchema.index({ fingerprintHash: 1, status: 1 });
DeviceRequestSchema.index({ status: 1, requestedAt: -1 });
DeviceRequestSchema.index({ email: 1, fingerprintHash: 1 });

export const DeviceRequest: Model<IDeviceRequest> =
  (mongoose.models['DeviceRequest'] as Model<IDeviceRequest>) ??
  mongoose.model<IDeviceRequest>('DeviceRequest', DeviceRequestSchema);
