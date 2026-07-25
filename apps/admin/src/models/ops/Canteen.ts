import mongoose, { Document, Schema } from 'mongoose';

export interface ICanteen extends Document {
  code: string;
  name: string;
  type: 'main' | 'subsidiary';
  parentCanteenId?: mongoose.Types.ObjectId;
  gstin?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CanteenSchema = new Schema<ICanteen>(
  {
    code:             { type: String, required: true },
    name:             { type: String, required: true },
    type:             { type: String, enum: ['main', 'subsidiary'], required: true },
    parentCanteenId:  { type: Schema.Types.ObjectId, ref: 'Canteen' },
    gstin:            String,
    contactPerson:    String,
    phone:            String,
    email:            String,
    isActive:         { type: Boolean, default: true },
    createdBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

CanteenSchema.index({ code: 1 }, { unique: true });
CanteenSchema.index({ type: 1, isActive: 1 });
CanteenSchema.index({ parentCanteenId: 1 });

export const Canteen =
  mongoose.models.Canteen ?? mongoose.model<ICanteen>('Canteen', CanteenSchema);
