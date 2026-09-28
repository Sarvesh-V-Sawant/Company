/**
 * Record delivery, including per-line short supply (Phase 30.07).
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { RecordDeliverySchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', RecordDeliverySchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.recordDelivery(id, input, actor) };
});
