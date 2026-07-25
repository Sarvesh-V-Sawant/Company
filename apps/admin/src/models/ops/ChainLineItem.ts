import mongoose, { Document, Schema } from 'mongoose';

export type VarianceReason =
  | 'EXPIRY_RISK'
  | 'SLOW_MOVING'
  | 'EXISTING_STOCK'
  | 'WASTAGE_HISTORY'
  | 'MOQ_ROUNDING'
  | 'MANUFACTURER_UNAVAILABLE'
  | 'CANTEEN_REQUEST'
  | 'OTHER';

export interface IChainLineItem extends Document {
  chainId: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  rawDescription?: string;
  uom: string;
  packSize?: number;
  originalQty: number;
  alteredQty: number;
  varianceReason?: VarianceReason;
  varianceNote?: string;
  rate?: number;
  taxableValue?: number;
  gstRatePercent?: number;
  taxAmount?: number;
  lineTotal?: number;
  deliveredQty?: number;
  shortSuppliedQty?: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const VARIANCE_REASONS: VarianceReason[] = [
  'EXPIRY_RISK', 'SLOW_MOVING', 'EXISTING_STOCK', 'WASTAGE_HISTORY',
  'MOQ_ROUNDING', 'MANUFACTURER_UNAVAILABLE', 'CANTEEN_REQUEST', 'OTHER',
];

const ChainLineItemSchema = new Schema<IChainLineItem>(
  {
    chainId:          { type: Schema.Types.ObjectId, ref: 'Chain', required: true },
    productId:        { type: Schema.Types.ObjectId, ref: 'Product' },
    rawDescription:   String,
    uom:              { type: String, required: true },
    packSize:         Number,
    originalQty:      { type: Number, required: true },
    alteredQty:       { type: Number, required: true },
    varianceReason:   { type: String, enum: VARIANCE_REASONS },
    varianceNote:     String,
    rate:             Number,
    taxableValue:     Number,
    gstRatePercent:   Number,
    taxAmount:        Number,
    lineTotal:        Number,
    deliveredQty:     Number,
    shortSuppliedQty: Number,
    sortOrder:        { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

ChainLineItemSchema.index({ chainId: 1, sortOrder: 1 });

export const ChainLineItem =
  mongoose.models.ChainLineItem ?? mongoose.model<IChainLineItem>('ChainLineItem', ChainLineItemSchema);
