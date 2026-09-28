/**
 * Chain detail and header edit (Phases 30.02–30.03).
 */
import { ChainService } from '@services/ops/ChainService';
import { UpdateChainSchema } from '@validators/ops/chain';
import { opsQuery, opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', null, async ({ actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainService.getById(id, actor) };
});

export const PATCH = opsMutation('workdesk', UpdateChainSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainService.update(id, input, actor) };
});
