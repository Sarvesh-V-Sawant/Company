import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  performedBy: mongoose.Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: String,
    changes: { type: Schema.Types.Mixed },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ performedBy: 1, createdAt: -1 });
AuditLogSchema.index({ targetId: 1, targetType: 1 });

export const AuditLog =
  mongoose.models.AuditLog ?? mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
