/**
 * Close a completed chain (Phase 30.08).
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { ChainCommentSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('approve', ChainCommentSchema.partial(), async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.close(id, actor, input.message) };
});
