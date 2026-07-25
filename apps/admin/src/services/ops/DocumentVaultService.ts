/**
 * Document vault — stores file metadata in MongoDB.
 *
 * DEV ADAPTER: files are stored under /tmp/genesis-docs/<chainId>/<filename>.
 * PRODUCTION TODO: swap the dev adapter for an object-storage adapter
 * (e.g. AWS S3 / GCP GCS) before going live. No new env var is required in
 * this phase; add the production upload URL to .env.local when the adapter is
 * implemented.
 */
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { ChainDocument, type DocType } from '@models/ops/ChainDocument';
import { ChainEvent } from '@models/ops/ChainEvent';

const DEV_STORAGE_ROOT = path.join(process.cwd(), '.genesis-docs');

async function devSave(chainId: string, fileName: string, buffer: Uint8Array): Promise<string> {
  const dir = path.join(DEV_STORAGE_ROOT, chainId);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, fileName);
  await fs.writeFile(dest, buffer);
  // Return a relative URL suitable for local dev serving
  return `/api/v1/ops/documents/file/${chainId}/${encodeURIComponent(fileName)}`;
}

export async function uploadDocument(params: {
  chainId: string;
  docType: DocType;
  fileName: string;
  mimeType: string;
  buffer: Uint8Array;
  uploadedBy: string;
  notes?: string;
}): Promise<typeof ChainDocument.prototype> {
  await connectDB();

  const { chainId, docType, fileName, mimeType, buffer, uploadedBy, notes } = params;

  // Determine next version number for this docType on this chain
  const existing = await ChainDocument.countDocuments({
    chainId: new mongoose.Types.ObjectId(chainId),
    docType,
    isDeleted: false,
  });

  const fileUrl = await devSave(chainId, fileName, buffer);

  const doc = await ChainDocument.create({
    chainId:    new mongoose.Types.ObjectId(chainId),
    docType,
    fileName,
    fileUrl,
    mimeType,
    sizeBytes:  buffer.byteLength,
    version:    existing + 1,
    uploadedBy: new mongoose.Types.ObjectId(uploadedBy),
    uploadedAt: new Date(),
    notes,
  });

  await ChainEvent.create({
    chainId:     new mongoose.Types.ObjectId(chainId),
    eventType:   'DOCUMENT_UPLOADED',
    message:     `${docType} uploaded: ${fileName}`,
    metadata:    { docType, fileName, version: existing + 1 },
    actorUserId: new mongoose.Types.ObjectId(uploadedBy),
  });

  return doc;
}

export async function listDocuments(chainId: string): Promise<(typeof ChainDocument.prototype)[]> {
  await connectDB();
  return ChainDocument.find({
    chainId: new mongoose.Types.ObjectId(chainId),
    isDeleted: false,
  }).sort({ uploadedAt: -1 }).lean();
}

export async function softDeleteDocument(docId: string, byUserId: string): Promise<void> {
  await connectDB();
  await ChainDocument.findByIdAndUpdate(docId, {
    isDeleted: true,
    updatedBy: new mongoose.Types.ObjectId(byUserId),
  });
}
