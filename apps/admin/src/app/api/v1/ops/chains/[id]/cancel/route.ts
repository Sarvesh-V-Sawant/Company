/**
 * Cancel a chain (Phase 30.03). Terminal and approval-grade.
 */
import { ChainService } from '@services/ops/ChainService';
import { CancelChainSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const PATCH = opsMutation('approve', CancelChainSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainService.cancel(id, input.reason, actor) };
});
