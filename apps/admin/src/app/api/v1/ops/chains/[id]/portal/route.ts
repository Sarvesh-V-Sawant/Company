/**
 * Mark the tax invoice as uploaded to the canteen's portal (Phase 30.06).
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { PortalUploadSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', PortalUploadSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.recordPortalUpload(id, input, actor) };
});
