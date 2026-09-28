/**
 * Record the manufacturer's tax invoice (Phase 30.06).
 */
import { ChainLifecycleService } from '@services/ops/ChainLifecycleService';
import { RecordTaxInvoiceSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', RecordTaxInvoiceSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainLifecycleService.recordTaxInvoice(id, input, actor) };
});
