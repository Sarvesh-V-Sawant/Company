import mongoose, { Document, Schema } from 'mongoose';

export interface ICommissionRule extends Document {
  scope: 'manufacturer' | 'product' | 'canteen';
  manufacturerId?: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  canteenId?: mongoose.Types.ObjectId;
  type: 'percentage' | 'perUnit' | 'flat';
  value: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  notes?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionRuleSchema = new Schema<ICommissionRule>(
  {
    scope:          { type: String, enum: ['manufacturer', 'product', 'canteen'], required: true },
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer' },
    productId:      { type: Schema.Types.ObjectId, ref: 'Product' },
    canteenId:      { type: Schema.Types.ObjectId, ref: 'Canteen' },
    type:           { type: String, enum: ['percentage', 'perUnit', 'flat'], required: true },
    value:          { type: Number, required: true },
    effectiveFrom:  { type: Date, required: true },
    effectiveTo:    Date,
    notes:          String,
    isActive:       { type: Boolean, default: true },
    createdBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

CommissionRuleSchema.index({ scope: 1, isActive: 1 });
CommissionRuleSchema.index({ manufacturerId: 1, isActive: 1 });

export const CommissionRule =
  mongoose.models.CommissionRule ?? mongoose.model<ICommissionRule>('CommissionRule', CommissionRuleSchema);
