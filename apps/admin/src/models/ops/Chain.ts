import mongoose, { Document, Schema } from 'mongoose';
import type { ChainStatus } from '@/services/ops/ChainStatusMachine';

export interface IHandoverEntry {
  fromUserId: mongoose.Types.ObjectId;
  toUserId: mongoose.Types.ObjectId;
  reason?: string;
  at: Date;
  byUserId: mongoose.Types.ObjectId;
}

export interface IDispatch {
  transporter?: string;
  lrNumber?: string;
  ewayBillNumber?: string;
  dispatchedAt?: Date;
  expectedDeliveryAt?: Date;
}

export interface ICanteenPayment {
  status?: 'pending' | 'partial' | 'paid';
  amount?: number;
  paidAt?: Date;
  referenceNo?: string;
}

export interface ICommissionRecord {
  ruleSnapshot?: Record<string, unknown>;
  computedAmount?: number;
  invoiceNumber?: string;
  raisedAt?: Date;
  receivedAt?: Date;
  receivedAmount?: number;
}

export interface IChain extends Document {
  chainNumber: string;
  status: ChainStatus;
  canteenId: mongoose.Types.ObjectId;
  originCanteenId?: mongoose.Types.ObjectId;
  manufacturerId: mongoose.Types.ObjectId;
  shipToAddressId?: mongoose.Types.ObjectId;
  billToAddressId?: mongoose.Types.ObjectId;
  sourcePoNumber?: string;
  sourcePoDate?: Date;
  assignedTo?: mongoose.Types.ObjectId;
  handoverHistory: IHandoverEntry[];
  originalOrderValue?: number;
  alteredOrderValue?: number;
  taxInvoiceNumber?: string;
  taxInvoiceDate?: Date;
  taxInvoiceValue?: number;
  portalUploadedAt?: Date;
  portalApprovedAt?: Date;
  soNumber?: string;
  soDate?: Date;
  dispatch: IDispatch;
  deliveredAt?: Date;
  podDocumentId?: mongoose.Types.ObjectId;
  canteenPayment: ICanteenPayment;
  commission: ICommissionRecord;
  isOnHold: boolean;
  holdReason?: string;
  cancelledAt?: Date;
  cancelReason?: string;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HandoverEntrySchema = new Schema<IHandoverEntry>(
  {
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason:     String,
    at:         { type: Date, required: true },
    byUserId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const ChainSchema = new Schema<IChain>(
  {
    chainNumber:      { type: String, required: true },
    status:           { type: String, required: true },
    canteenId:        { type: Schema.Types.ObjectId, ref: 'Canteen', required: true },
    originCanteenId:  { type: Schema.Types.ObjectId, ref: 'Canteen' },
    manufacturerId:   { type: Schema.Types.ObjectId, ref: 'Manufacturer', required: true },
    shipToAddressId:  { type: Schema.Types.ObjectId, ref: 'OpsAddress' },
    billToAddressId:  { type: Schema.Types.ObjectId, ref: 'OpsAddress' },
    sourcePoNumber:   String,
    sourcePoDate:     Date,
    assignedTo:       { type: Schema.Types.ObjectId, ref: 'User' },
    handoverHistory:  { type: [HandoverEntrySchema], default: [] },
    originalOrderValue: Number,
    alteredOrderValue:  Number,
    taxInvoiceNumber: String,
    taxInvoiceDate:   Date,
    taxInvoiceValue:  Number,
    portalUploadedAt: Date,
    portalApprovedAt: Date,
    soNumber:         String,
    soDate:           Date,
    dispatch: {
      transporter:        String,
      lrNumber:           String,
      ewayBillNumber:     String,
      dispatchedAt:       Date,
      expectedDeliveryAt: Date,
    },
    deliveredAt:      Date,
    podDocumentId:    { type: Schema.Types.ObjectId, ref: 'ChainDocument' },
    canteenPayment: {
      status:      { type: String, enum: ['pending', 'partial', 'paid'] },
      amount:      Number,
      paidAt:      Date,
      referenceNo: String,
    },
    commission: {
      ruleSnapshot:    Schema.Types.Mixed,
      computedAmount:  Number,
      invoiceNumber:   String,
      raisedAt:        Date,
      receivedAt:      Date,
      receivedAmount:  Number,
    },
    isOnHold:         { type: Boolean, default: false },
    holdReason:       String,
    cancelledAt:      Date,
    cancelReason:     String,
    createdBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

ChainSchema.index({ chainNumber: 1 }, { unique: true });
ChainSchema.index({ status: 1, createdAt: -1 });
ChainSchema.index({ assignedTo: 1, status: 1 });
ChainSchema.index({ canteenId: 1, createdAt: -1 });
ChainSchema.index({ manufacturerId: 1, createdAt: -1 });

export const Chain =
  mongoose.models.Chain ?? mongoose.model<IChain>('Chain', ChainSchema);
