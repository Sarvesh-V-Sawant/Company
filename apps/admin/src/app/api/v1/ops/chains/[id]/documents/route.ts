/**
 * Chain document vault: list and upload (Phase 30.05).
 */
import { ChainService } from '@services/ops/ChainService';
import { listDocuments, uploadDocument } from '@services/ops/DocumentVaultService';
import { ListDocumentsSchema, DOC_TYPES } from '@validators/ops/chain';
import { MAX_DOCUMENT_BYTES } from '@constants/ops-errors';
import { opsQuery, opsUpload, requireIdParam, OpsRouteError } from '@lib/utils/ops-route';
import type { DocType } from '@models/ops/ChainDocument';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', ListDocumentsSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  await ChainService.loadForActor(id, actor);
  return { data: await listDocuments(id, input.docType) };
});

export const POST = opsUpload('workdesk', MAX_DOCUMENT_BYTES, async ({ file, fields, actor, params }) => {
  const id = requireIdParam(params);
  await ChainService.loadForActor(id, actor);

  const docType = fields.docType as DocType | undefined;
  if (!docType || !(DOC_TYPES as readonly string[]).includes(docType)) {
    throw new OpsRouteError(
      'OPS_043',
      400,
      `A valid docType is required. Expected one of: ${DOC_TYPES.join(', ')}.`,
    );
  }

  const doc = await uploadDocument({
    chainId: id,
    docType,
    fileName: file.name,
    mimeType: file.type,
    buffer: file.bytes,
    uploadedBy: actor.userId,
    notes: fields.notes,
  });

  return {
    created: {
      id: String(doc._id),
      docType: doc.docType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      version: doc.version,
      sizeBytes: doc.sizeBytes,
    },
  };
});
