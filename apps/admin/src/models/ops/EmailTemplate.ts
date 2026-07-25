import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailTemplate extends Document {
  key: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  scope: 'global' | 'manufacturer';
  manufacturerId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    key:             { type: String, required: true },
    name:            { type: String, required: true },
    subjectTemplate: { type: String, required: true },
    bodyTemplate:    { type: String, required: true },
    scope:           { type: String, enum: ['global', 'manufacturer'], required: true },
    manufacturerId:  { type: Schema.Types.ObjectId, ref: 'Manufacturer' },
    isActive:        { type: Boolean, default: true },
    createdBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

EmailTemplateSchema.index({ key: 1 });
EmailTemplateSchema.index({ scope: 1, isActive: 1 });

export const EmailTemplate =
  mongoose.models.EmailTemplate ?? mongoose.model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);
