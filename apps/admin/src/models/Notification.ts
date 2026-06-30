import mongoose, { Document, Schema, Model } from 'mongoose';

export type NotificationType =
  | 'leaveApproved'
  | 'leaveRejected'
  | 'leaveSubmitted'
  | 'leaveRevoked'
  | 'regularizationApproved'
  | 'regularizationRejected'
  | 'regularizationSubmitted'
  | 'attendanceReminder'
  | 'passwordReset'
  | 'payrollGenerated'
  | 'accountActivated'
  | 'accountDeactivated';

export interface IChannelStatus {
  sent: boolean;
  sentAt?: Date;
  messageId?: string;
  error?: string;
}

export interface INotification extends Document {
  employeeId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  channels: { push: IChannelStatus; email: IChannelStatus };
  referenceType?: 'leaveRequest' | 'regularizationRequest' | 'payrollSummary';
  referenceId?: mongoose.Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

const ChannelStatusSchema = new Schema<IChannelStatus>(
  {
    sent:      { type: Boolean, required: true, default: false },
    sentAt:    { type: Date },
    messageId: { type: String },
    error:     { type: String },
  },
  { _id: false },
);

const NotificationSchema = new Schema<INotification>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'leaveApproved', 'leaveRejected', 'leaveSubmitted', 'leaveRevoked',
        'regularizationApproved', 'regularizationRejected', 'regularizationSubmitted',
        'attendanceReminder', 'passwordReset', 'payrollGenerated',
        'accountActivated', 'accountDeactivated',
      ],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    body:  { type: String, required: true, maxlength: 1000 },
    channels: {
      push:  { type: ChannelStatusSchema, required: true, default: () => ({ sent: false }) },
      email: { type: ChannelStatusSchema, required: true, default: () => ({ sent: false }) },
    },
    referenceType: { type: String, enum: ['leaveRequest', 'regularizationRequest', 'payrollSummary'] },
    referenceId:   { type: Schema.Types.ObjectId },
    isRead:  { type: Boolean, required: true, default: false },
    readAt:  { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

NotificationSchema.index({ employeeId: 1, isRead: 1 });
NotificationSchema.index({ employeeId: 1, createdAt: -1 });
NotificationSchema.index({ referenceId: 1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31_536_000 });

export const Notification: Model<INotification> =
  (mongoose.models['Notification'] as Model<INotification>) ??
  mongoose.model<INotification>('Notification', NotificationSchema);
