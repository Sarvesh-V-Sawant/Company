import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailAttachment {
  fileName: string;
  format: 'pdf' | 'xlsx';
  documentId?: mongoose.Types.ObjectId;
}

export interface IEmailLog extends Document {
  chainId?: mongoose.Types.ObjectId;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments: IEmailAttachment[];
  status: 'draft' | 'queued' | 'sent' | 'failed' | 'bounced';
  providerMessageId?: string;
  sentBy?: mongoose.Types.ObjectId;
  sentAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailAttachmentSchema = new Schema<IEmailAttachment>(
  {
    fileName:   { type: String, required: true },
    format:     { type: String, enum: ['pdf', 'xlsx'], required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'ChainDocument' },
  },
  { _id: false },
);

const EmailLogSchema = new Schema<IEmailLog>(
  {
    chainId:           { type: Schema.Types.ObjectId, ref: 'Chain' },
    toEmails:          { type: [String], required: true },
    ccEmails:          { type: [String], default: [] },
    bccEmails:         { type: [String], default: [] },
    subject:           { type: String, required: true },
    bodyHtml:          { type: String, required: true },
    bodyText:          String,
    attachments:       { type: [EmailAttachmentSchema], default: [] },
    status:            { type: String, enum: ['draft', 'queued', 'sent', 'failed', 'bounced'], required: true, default: 'draft' },
    providerMessageId: String,
    sentBy:            { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt:            Date,
    errorMessage:      String,
  },
  { timestamps: true },
);

EmailLogSchema.index({ chainId: 1, createdAt: -1 });
EmailLogSchema.index({ status: 1, createdAt: -1 });

export const EmailLog =
  mongoose.models.EmailLog ?? mongoose.model<IEmailLog>('EmailLog', EmailLogSchema);
