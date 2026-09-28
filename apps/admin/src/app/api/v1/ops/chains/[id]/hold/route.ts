/**
 * Place a chain on hold or release it (Phase 30.03).
 */
import { ChainService } from '@services/ops/ChainService';
import { HoldChainSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const PATCH = opsMutation('workdesk', HoldChainSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainService.setHold(id, input.hold, actor, input.reason) };
});
