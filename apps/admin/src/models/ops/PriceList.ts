import mongoose, { Document, Schema } from 'mongoose';

export interface IPriceListItem {
  productId: mongoose.Types.ObjectId;
  rate: number;
  currency: 'INR';
}

export interface IPriceList extends Document {
  manufacturerId: mongoose.Types.ObjectId;
  canteenId?: mongoose.Types.ObjectId;
  effectiveFrom: Date;
  effectiveTo?: Date;
  items: IPriceListItem[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PriceListItemSchema = new Schema<IPriceListItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    rate:      { type: Number, required: true },
    currency:  { type: String, default: 'INR' },
  },
  { _id: false },
);

const PriceListSchema = new Schema<IPriceList>(
  {
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', required: true },
    canteenId:      { type: Schema.Types.ObjectId, ref: 'Canteen' },
    effectiveFrom:  { type: Date, required: true },
    effectiveTo:    Date,
    items:          { type: [PriceListItemSchema], default: [] },
    isActive:       { type: Boolean, default: true },
    createdBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

PriceListSchema.index({ manufacturerId: 1, isActive: 1 });
PriceListSchema.index({ canteenId: 1, manufacturerId: 1 });

export const PriceList =
  mongoose.models.PriceList ?? mongoose.model<IPriceList>('PriceList', PriceListSchema);
