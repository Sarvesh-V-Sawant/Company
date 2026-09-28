/**
 * Record the sales order received after portal approval (Phase 30.06).
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { RecordSalesOrderSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', RecordSalesOrderSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.recordSalesOrder(id, input, actor) };
});
