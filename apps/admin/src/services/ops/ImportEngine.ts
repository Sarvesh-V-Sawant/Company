/**
 * Excel import engine skeleton.
 * Uses exceljs (already in deps). Each entity type will extend this in later phases.
 */
import type ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { ImportBatch, type ImportEntityType } from '@models/ops/ImportBatch';

export interface RowError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: RowError[];
}

export interface PreviewResult {
  batchId: string;
  fileName: string;
  entityType: ImportEntityType;
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: ParsedRow[];
  columnMapping: Record<string, string>;
}

export async function parseExcelBuffer(
  buffer: Uint8Array,
  entityType: ImportEntityType,
  fileName: string,
  uploadedBy: string,
  columnMapping: Record<string, string>,
  rowValidator: (rowData: Record<string, unknown>, rowNum: number) => RowError[],
): Promise<PreviewResult> {
  const ExcelJSLib = (await import('exceljs')).default;
  const wb = new ExcelJSLib.Workbook();
  // exceljs accepts ArrayBuffer; cast through unknown to satisfy version-sensitive Buffer generic
  await (wb.xlsx as unknown as { load(b: Uint8Array): Promise<void> }).load(buffer);
  const ws = wb.worksheets[0];

  if (!ws) throw new Error('No worksheet found in uploaded file');

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell) => {
    headers.push(String(cell.value ?? '').trim());
  });

  const rows: ParsedRow[] = [];
  ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return; // skip header

    const data: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell, colNumber: number) => {
      const header = headers[colNumber - 1];
      if (header) {
        const mappedKey = columnMapping[header] ?? header;
        data[mappedKey] = cell.value;
      }
    });

    const errors = rowValidator(data, rowNumber);
    rows.push({ rowNumber, data, errors });
  });

  const validRows = rows.filter((r) => r.errors.length === 0).length;
  const errorRows = rows.filter((r) => r.errors.length > 0).length;

  await connectDB();
  const batch = await ImportBatch.create({
    entityType,
    fileName,
    columnMapping,
    totalRows: rows.length,
    validRows,
    errorRows,
    importedRows: 0,
    status: 'previewed',
    rowErrors: rows.flatMap((r) => r.errors),
    createdBy: new mongoose.Types.ObjectId(uploadedBy),
  });

  return {
    batchId: String(batch._id),
    fileName,
    entityType,
    totalRows: rows.length,
    validRows,
    errorRows,
    rows,
    columnMapping,
  };
}

export async function commitBatch(
  batchId: string,
  commitFn: (rows: ParsedRow[]) => Promise<number>,
  rows: ParsedRow[],
): Promise<void> {
  const importedRows = await commitFn(rows.filter((r) => r.errors.length === 0));
  await connectDB();
  await ImportBatch.findByIdAndUpdate(batchId, {
    status: 'committed',
    importedRows,
  });
}

export async function discardBatch(batchId: string): Promise<void> {
  await connectDB();
  await ImportBatch.findByIdAndUpdate(batchId, { status: 'discarded' });
}
