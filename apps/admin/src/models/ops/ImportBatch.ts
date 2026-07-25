import mongoose, { Document, Schema } from 'mongoose';

export type ImportEntityType = 'PRODUCT' | 'CANTEEN' | 'ADDRESS' | 'PRICE_LIST' | 'CHAIN_LINES';
export type ImportBatchStatus = 'previewed' | 'committed' | 'discarded' | 'failed';

export interface IImportError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface IImportBatch extends Document {
  entityType: ImportEntityType;
  fileName: string;
  columnMapping?: Record<string, string>;
  totalRows: number;
  validRows: number;
  errorRows: number;
  importedRows: number;
  status: ImportBatchStatus;
  rowErrors: IImportError[];
  chainId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ImportErrorSchema = new Schema<IImportError>(
  {
    rowNumber: { type: Number, required: true },
    field:     { type: String, required: true },
    message:   { type: String, required: true },
  },
  { _id: false },
);

const ImportBatchSchema = new Schema<IImportBatch>(
  {
    entityType:    { type: String, enum: ['PRODUCT', 'CANTEEN', 'ADDRESS', 'PRICE_LIST', 'CHAIN_LINES'], required: true },
    fileName:      { type: String, required: true },
    columnMapping: { type: Schema.Types.Mixed },
    totalRows:     { type: Number, required: true, default: 0 },
    validRows:     { type: Number, required: true, default: 0 },
    errorRows:     { type: Number, required: true, default: 0 },
    importedRows:  { type: Number, required: true, default: 0 },
    status:        { type: String, enum: ['previewed', 'committed', 'discarded', 'failed'], required: true, default: 'previewed' },
    rowErrors:     { type: [ImportErrorSchema], default: [] },
    chainId:       { type: Schema.Types.ObjectId, ref: 'Chain' },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

ImportBatchSchema.index({ entityType: 1, createdAt: -1 });
ImportBatchSchema.index({ status: 1 });

export const ImportBatch =
  mongoose.models.ImportBatch ?? mongoose.model<IImportBatch>('ImportBatch', ImportBatchSchema);
