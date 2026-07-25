import mongoose, { Document, Schema } from 'mongoose';

export type DocType =
  | 'SOURCE_PO'
  | 'ALTERED_ORDER'
  | 'TAX_INVOICE'
  | 'SALES_ORDER'
  | 'EWAY_BILL'
  | 'LR_POD'
  | 'PAYMENT_PROOF'
  | 'COMMISSION_INVOICE'
  | 'OTHER';

export interface IChainDocument extends Document {
  chainId: mongoose.Types.ObjectId;
  docType: DocType;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
  notes?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DOC_TYPES: DocType[] = [
  'SOURCE_PO', 'ALTERED_ORDER', 'TAX_INVOICE', 'SALES_ORDER',
  'EWAY_BILL', 'LR_POD', 'PAYMENT_PROOF', 'COMMISSION_INVOICE', 'OTHER',
];

const ChainDocumentSchema = new Schema<IChainDocument>(
  {
    chainId:    { type: Schema.Types.ObjectId, ref: 'Chain', required: true },
    docType:    { type: String, enum: DOC_TYPES, required: true },
    fileName:   { type: String, required: true },
    fileUrl:    { type: String, required: true },
    mimeType:   { type: String, required: true },
    sizeBytes:  { type: Number, required: true },
    version:    { type: Number, required: true, default: 1 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, required: true },
    notes:      String,
    isDeleted:  { type: Boolean, default: false },
  },
  { timestamps: true },
);

ChainDocumentSchema.index({ chainId: 1, docType: 1, isDeleted: 1 });

export const ChainDocument =
  mongoose.models.ChainDocument ?? mongoose.model<IChainDocument>('ChainDocument', ChainDocumentSchema);
