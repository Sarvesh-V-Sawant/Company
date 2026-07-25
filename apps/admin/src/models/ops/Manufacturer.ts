import mongoose, { Document, Schema } from 'mongoose';

export interface IManufacturer extends Document {
  code: string;
  name: string;
  gstin?: string;
  portalName?: string;
  portalUrl?: string;
  primaryEmail: string;
  additionalEmails: string[];
  contactPerson?: string;
  phone?: string;
  defaultCommissionRuleId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ManufacturerSchema = new Schema<IManufacturer>(
  {
    code:                    { type: String, required: true },
    name:                    { type: String, required: true },
    gstin:                   String,
    portalName:              String,
    portalUrl:               String,
    primaryEmail:            { type: String, required: true },
    additionalEmails:        { type: [String], default: [] },
    contactPerson:           String,
    phone:                   String,
    defaultCommissionRuleId: { type: Schema.Types.ObjectId, ref: 'CommissionRule' },
    isActive:                { type: Boolean, default: true },
    createdBy:               { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:               { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

ManufacturerSchema.index({ code: 1 }, { unique: true });
ManufacturerSchema.index({ isActive: 1 });

export const Manufacturer =
  mongoose.models.Manufacturer ?? mongoose.model<IManufacturer>('Manufacturer', ManufacturerSchema);
