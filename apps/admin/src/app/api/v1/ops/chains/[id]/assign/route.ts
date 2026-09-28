/**
 * Hand a chain over to another user (Phase 30.02).
 * Reassignment is approval-grade because it changes who can see the chain.
 */
import { ChainService } from '@services/ops/ChainService';
import { AssignChainSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const PATCH = opsMutation('approve', AssignChainSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainService.assign(id, input.toUserId, actor, input.reason) };
});
