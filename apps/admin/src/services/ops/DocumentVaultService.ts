/**
 * Document vault — file metadata in MongoDB, bytes in pluggable storage.
 *
 * PHASE 30.05 CHANGES (additive; the original exported functions keep their
 * names and signatures so existing callers cannot break):
 *   - Bytes now go through lib/storage, so the same code path serves the local
 *     filesystem in dev and Cloudflare R2 in production. Driver is chosen by the
 *     STORAGE_DRIVER env var; default `local` reproduces the previous behaviour.
 *   - `storageKey` is persisted so an object can be located independently of the
 *     display URL.
 *   - Added getDocument() / readDocumentBytes() / resolveDownload(), which the
 *     new authenticated download route needs.
 *
 * FIXED DEFECT: the original devSave() returned
 *   /api/v1/ops/documents/file/{chainId}/{fileName}
 * but no such route existed anywhere in the tree, so every upload produced a
 * dead link. That route now exists and is authenticated.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { ChainDocument, type DocType } from '@models/ops/ChainDocument';
import { ChainEvent } from '@models/ops/ChainEvent';
import { Chain } from '@models/ops/Chain';
import { AppError } from '@services/AuthService';
import {
  buildDocumentKey,
  getStorageAdapter,
  sanitizeFileName,
  StorageError,
} from '@lib/storage';
import {
  ALLOWED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
} from '@constants/ops-errors';

/** Derives the fiscal-year segment of the storage key from the chain number. */
function fiscalYearFromChainNumber(chainNumber: string): string {
  // Chain numbers are GEN/{fy}/{seq}; fall back to a stable bucket if unusual.
  const parts = chainNumber.split('/');
  return parts.length >= 2 && parts[1] ? parts[1] : 'unknown-fy';
}

export interface UploadDocumentParams {
  chainId: string;
  docType: DocType;
  fileName: string;
  mimeType: string;
  buffer: Uint8Array;
  uploadedBy: string;
  notes?: string;
  /**
   * Skip MIME/size validation for bytes this app generated itself (the altered
   * order PDF/XLSX). User uploads are always validated.
   */
  trusted?: boolean;
}

export async function uploadDocument(params: UploadDocumentParams) {
  await connectDB();

  const { chainId, docType, mimeType, buffer, uploadedBy, notes, trusted } = params;
  const fileName = sanitizeFileName(params.fileName);

  if (!trusted) {
    if (buffer.byteLength === 0) {
      throw new AppError('OPS_043', 415, 'The uploaded file is empty.');
    }
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
      throw new AppError(
        'OPS_042',
        413,
        `File is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
      );
    }
    if (!ALLOWED_DOCUMENT_MIME.includes(mimeType)) {
      throw new AppError('OPS_043', 415, `File type "${mimeType}" is not accepted.`);
    }
  }

  const chain = await Chain.findById(chainId).select('chainNumber').lean<{ chainNumber: string }>();
  if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

  const chainOid = new mongoose.Types.ObjectId(chainId);

  // Version is per docType per chain, counting live documents only.
  const existing = await ChainDocument.countDocuments({
    chainId: chainOid,
    docType,
    isDeleted: false,
  });

  const storageKey = buildDocumentKey({
    fiscalYear: fiscalYearFromChainNumber(chain.chainNumber),
    chainNumber: chain.chainNumber,
    docType,
    fileName,
  });

  const adapter = getStorageAdapter();
  try {
    await adapter.put(storageKey, buffer, mimeType);
  } catch (err) {
    if (err instanceof StorageError) {
      throw new AppError('OPS_044', 500, 'The document could not be stored. Please retry.');
    }
    throw err;
  }

  const doc = await ChainDocument.create({
    chainId: chainOid,
    docType,
    fileName,
    // Always the app's own authenticated route; never a raw storage URL, so a
    // private bucket stays private.
    fileUrl: `/api/v1/ops/documents/${'{id}'}`,
    storageKey,
    mimeType,
    sizeBytes: buffer.byteLength,
    version: existing + 1,
    uploadedBy: new mongoose.Types.ObjectId(uploadedBy),
    uploadedAt: new Date(),
    notes,
  });

  // The document id is only known after creation, so patch the URL now.
  doc.fileUrl = `/api/v1/ops/documents/${String(doc._id)}`;
  await doc.save();

  await ChainEvent.create({
    chainId: chainOid,
    eventType: 'DOCUMENT_UPLOADED',
    message: `${docType} uploaded: ${fileName}`,
    metadata: { docType, fileName, version: existing + 1, documentId: String(doc._id) },
    actorUserId: new mongoose.Types.ObjectId(uploadedBy),
  });

  return doc;
}

export async function listDocuments(chainId: string, docType?: DocType) {
  await connectDB();
  const filter: Record<string, unknown> = {
    chainId: new mongoose.Types.ObjectId(chainId),
    isDeleted: false,
  };
  if (docType) filter.docType = docType;
  return ChainDocument.find(filter)
    .sort({ uploadedAt: -1 })
    .populate('uploadedBy', 'firstName lastName email')
    .lean();
}

export async function getDocument(docId: string) {
  await connectDB();
  if (!/^[0-9a-f]{24}$/i.test(docId)) {
    throw new AppError('OPS_030', 400, 'Invalid document ID.');
  }
  const doc = await ChainDocument.findById(docId);
  if (!doc || doc.isDeleted) throw new AppError('OPS_041', 404, 'Document not found.');
  return doc;
}

/** Reads the raw bytes for a document. Used by the authenticated download route. */
export async function readDocumentBytes(docId: string): Promise<{
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}> {
  const doc = await getDocument(docId);
  const key: string | undefined = (doc as unknown as { storageKey?: string }).storageKey;

  if (!key) {
    // Documents written before 30.05 have no storageKey. Fail with a clear
    // message rather than a 500 from the storage layer.
    throw new AppError(
      'OPS_041',
      404,
      'This document was stored before the storage upgrade and has no retrievable key.',
    );
  }

  try {
    const bytes = await getStorageAdapter().get(key);
    return { bytes, fileName: doc.fileName, mimeType: doc.mimeType };
  } catch (err) {
    if (err instanceof StorageError) {
      throw new AppError('OPS_041', 404, 'The stored file could not be retrieved.');
    }
    throw err;
  }
}

/**
 * Returns a redirect target when the adapter can sign URLs, otherwise null,
 * telling the route to stream the bytes itself.
 */
export async function resolveSignedUrl(docId: string, expiresInSeconds = 300): Promise<string | null> {
  const doc = await getDocument(docId);
  const key: string | undefined = (doc as unknown as { storageKey?: string }).storageKey;
  if (!key) return null;
  return getStorageAdapter().signedUrl(key, expiresInSeconds);
}

export async function softDeleteDocument(docId: string, byUserId: string): Promise<void> {
  await connectDB();
  const doc = await getDocument(docId);
  await ChainDocument.findByIdAndUpdate(docId, { isDeleted: true });

  await ChainEvent.create({
    chainId: doc.chainId,
    eventType: 'DOCUMENT_UPLOADED',
    message: `${doc.docType} removed: ${doc.fileName}`,
    metadata: { docType: doc.docType, fileName: doc.fileName, removed: true },
    actorUserId: new mongoose.Types.ObjectId(byUserId),
  });
}
