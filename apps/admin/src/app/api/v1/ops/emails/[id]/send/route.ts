/**
 * Send a previously reviewed draft (Phase 30.04).
 *
 * A provider failure is recorded on the draft and returned as OPS_047; the draft
 * survives so it can be retried rather than silently lost.
 */
import { OpsEmailService } from '@services/ops/OpsEmailService';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', null, async ({ actor, params }) => {
  const id = requireIdParam(params);
  return { data: await OpsEmailService.send(id, actor.userId) };
});
