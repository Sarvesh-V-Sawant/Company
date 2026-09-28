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
  gstApplicable?: boolean;
  sacCode?: string;
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
    gstApplicable:  Boolean,
    sacCode:        String,
    notes:          String,
    isActive:       { type: Boolean, default: true },
    createdBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

CommissionRuleSchema.index({ scope: 1, isActive: 1 });
CommissionRuleSchema.index({ manufacturerId: 1, isActive: 1 });
// Backs the import upsert's dedup key atomically — a rule is versioned by
// scope + its scope-matching id + start date. For any given scope, the other
// two id fields are consistently absent across all docs of that scope, so they
// don't collide with docs of a different scope.
CommissionRuleSchema.index({ scope: 1, manufacturerId: 1, productId: 1, canteenId: 1, effectiveFrom: 1 }, { unique: true });

export const CommissionRule =
  mongoose.models.CommissionRule ?? mongoose.model<ICommissionRule>('CommissionRule', CommissionRuleSchema);
