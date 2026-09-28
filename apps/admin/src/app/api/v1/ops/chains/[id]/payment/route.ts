/**
 * Record the canteen's payment to the manufacturer (Phase 30.08).
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { RecordPaymentSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', RecordPaymentSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.recordPayment(id, input, actor) };
});
