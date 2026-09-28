/**
 * Record dispatch / transit details (Phase 30.07).
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { RecordDispatchSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', RecordDispatchSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.recordDispatch(id, input, actor) };
});
