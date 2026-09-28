/**
 * Move a chain through the status machine (Phase 30.03).
 *
 * Managers may change status — that was your explicit ruling — so this is a
 * work-desk action, not an approval-grade one. Invalid transitions are rejected
 * by ChainService with OPS_032 and the list of allowed next statuses.
 */
import { ChainService } from '@services/ops/ChainService';
import { ChainStatusUpdateSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const PATCH = opsMutation('workdesk', ChainStatusUpdateSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { data: await ChainService.changeStatus(id, input.toStatus, actor, input.message) };
});
