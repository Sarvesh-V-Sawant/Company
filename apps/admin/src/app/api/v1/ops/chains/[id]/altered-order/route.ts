/**
 * Generate the altered order document (Phase 30.04).
 * The generated file is filed in the vault, so what is emailed and what is on
 * record are the same bytes.
 */
import { AlteredOrderService } from '@services/ops/AlteredOrderService';
import { ChainService } from '@services/ops/ChainService';
import { GenerateAlteredOrderSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', GenerateAlteredOrderSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  await ChainService.loadForActor(id, actor);
  return { created: await AlteredOrderService.generateAndStore(id, input.format, actor.userId) };
});
