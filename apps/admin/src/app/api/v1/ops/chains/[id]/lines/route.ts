/**
 * Replace the order line items (Phase 30.02).
 *
 * PUT replaces the whole set rather than patching individual lines: the altered
 * order is edited as a table, and a whole-set replace makes the totals
 * recalculation deterministic. Lines lock once the order has been sent to the
 * manufacturer (OPS_061).
 */
import { ChainService } from '@services/ops/ChainService';
import { ReplaceChainLinesSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const PUT = opsMutation('workdesk', ReplaceChainLinesSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainService.replaceLines(id, input.lines, actor) };
});
