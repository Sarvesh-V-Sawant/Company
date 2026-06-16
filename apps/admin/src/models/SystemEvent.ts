import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemEvent extends Document {
  eventType: string;
  date: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const SystemEventSchema = new Schema<ISystemEvent>(
  {
    eventType: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
    startedAt: Date,
    completedAt: Date,
    error: String,
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SystemEventSchema.index({ eventType: 1, date: 1 }, { unique: true });

export const SystemEvent =
  mongoose.models.SystemEvent ??
  mongoose.model<ISystemEvent>('SystemEvent', SystemEventSchema);
