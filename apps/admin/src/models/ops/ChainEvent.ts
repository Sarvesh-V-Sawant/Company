import mongoose, { Document, Schema } from 'mongoose';

export type ChainEventType =
  | 'STATUS_CHANGE'
  | 'DOCUMENT_UPLOADED'
  | 'EMAIL_SENT'
  | 'ASSIGNMENT_CHANGED'
  | 'LINE_EDITED'
  | 'COMMENT'
  | 'HOLD'
  | 'CANCEL';

export interface IChainEvent extends Document {
  chainId: mongoose.Types.ObjectId;
  eventType: ChainEventType;
  fromStatus?: string;
  toStatus?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  actorUserId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const EVENT_TYPES: ChainEventType[] = [
  'STATUS_CHANGE', 'DOCUMENT_UPLOADED', 'EMAIL_SENT',
  'ASSIGNMENT_CHANGED', 'LINE_EDITED', 'COMMENT', 'HOLD', 'CANCEL',
];

const ChainEventSchema = new Schema<IChainEvent>(
  {
    chainId:     { type: Schema.Types.ObjectId, ref: 'Chain', required: true },
    eventType:   { type: String, enum: EVENT_TYPES, required: true },
    fromStatus:  String,
    toStatus:    String,
    message:     String,
    metadata:    { type: Schema.Types.Mixed },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ChainEventSchema.index({ chainId: 1, createdAt: -1 });

export const ChainEvent =
  mongoose.models.ChainEvent ?? mongoose.model<IChainEvent>('ChainEvent', ChainEventSchema);
