/**
 * Record the portal's approval or rejection (Phase 30.06).
 * Approval gates the sales order, so this is an approval-grade action.
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { PortalDecisionSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('approve', PortalDecisionSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.recordPortalDecision(id, input, actor) };
});
