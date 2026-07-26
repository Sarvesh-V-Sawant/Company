import mongoose, { Document, Schema } from 'mongoose';

export interface IOpsAddress extends Document {
  ownerType: 'canteen' | 'manufacturer' | 'company';
  ownerId?: mongoose.Types.ObjectId;
  label: string;
  addressType: 'shipTo' | 'billTo' | 'both';
  line1: string;
  line2?: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  gstin?: string;
  isDefault: boolean;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OpsAddressSchema = new Schema<IOpsAddress>(
  {
    ownerType:   { type: String, enum: ['canteen', 'manufacturer', 'company'], required: true },
    ownerId:     { type: Schema.Types.ObjectId, required: function(this: IOpsAddress) { return this.ownerType !== 'company'; } },
    label:       { type: String, required: true },
    addressType: { type: String, enum: ['shipTo', 'billTo', 'both'], required: true },
    line1:       { type: String, required: true },
    line2:       String,
    city:        { type: String, required: true },
    state:       { type: String, required: true },
    stateCode:   { type: String, required: true },
    pincode:     { type: String, required: true },
    gstin:       String,
    isDefault:   { type: Boolean, default: false },
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

OpsAddressSchema.index({ ownerType: 1, ownerId: 1, isActive: 1 });

export const OpsAddress =
  mongoose.models.OpsAddress ?? mongoose.model<IOpsAddress>('OpsAddress', OpsAddressSchema);
