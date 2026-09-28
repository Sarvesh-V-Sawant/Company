/**
 * Authenticated document download and soft delete (Phase 30.05).
 *
 * FIXES A REAL DEFECT: DocumentVaultService always returned a URL under
 * /api/v1/ops/documents/... but no such route existed, so every uploaded file
 * produced a dead link. Bytes are streamed through this route rather than
 * exposing storage URLs, so the bucket stays private and chain scope is enforced
 * on every download.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDocument, readDocumentBytes, softDeleteDocument } from '@services/ops/DocumentVaultService';
import { ChainService } from '@services/ops/ChainService';
import { getAuthUser } from '@mw/requireAuth';
import { assertWorkDeskAccess } from '@mw/requireRole';
import { mapOpsError, requireIdParam, opsMutation } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  try {
    const payload = await getAuthUser(request);
    assertWorkDeskAccess(payload);

    const params = await context.params;
    const id = requireIdParam(params as unknown as Record<string, string>);

    const doc = await getDocument(id);
    // Enforce chain scope: an executive cannot download a file from a chain that
    // is not assigned to them.
    await ChainService.loadForActor(String(doc.chainId), {
      userId: payload.userId,
      role: payload.role,
    });

    const file = await readDocumentBytes(id);
    const disposition = new URL(request.url).searchParams.get('download') === '1'
      ? 'attachment'
      : 'inline';

    return new Response(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': String(file.bytes.byteLength),
        // encodeURIComponent keeps non-ASCII file names from breaking the header.
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
        // Documents are per-user authorised, so they must never land in a shared cache.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return mapOpsError(err);
  }
}

export const DELETE = opsMutation('approve', null, async ({ actor, params }) => {
  const id = requireIdParam(params);
  const doc = await getDocument(id);
  await ChainService.loadForActor(String(doc.chainId), actor);
  await softDeleteDocument(id, actor.userId);
  return { data: { id, deleted: true } };
});
