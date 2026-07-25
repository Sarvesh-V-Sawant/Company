import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  sku: string;
  name: string;
  description?: string;
  manufacturerId: mongoose.Types.ObjectId;
  uom: string;
  packSize?: number;
  hsnCode?: string;
  gstRatePercent?: number;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    sku:            { type: String, required: true },
    name:           { type: String, required: true },
    description:    String,
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', required: true },
    uom:            { type: String, required: true },
    packSize:       Number,
    hsnCode:        String,
    gstRatePercent: Number,
    isActive:       { type: Boolean, default: true },
    createdBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

ProductSchema.index({ sku: 1 }, { unique: true });
ProductSchema.index({ manufacturerId: 1, isActive: 1 });

export const Product =
  mongoose.models.Product ?? mongoose.model<IProduct>('Product', ProductSchema);
