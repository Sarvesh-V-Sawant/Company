/**
 * Work Desk operational settings (Phase 30.04 / 30.08).
 *
 * Holds the document titles and the commission tax treatment that were pending
 * your CA's confirmation, so nothing legal is hardcoded in the codebase.
 * Reading is open to the whole desk; editing is admin-only.
 */
import { OpsSettingsService } from '@services/ops/OpsSettingsService';
import { UpdateOpsSettingsSchema } from '@validators/ops/chain';
import { opsQuery, opsMutation, OpsRouteError } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', null, async () => {
  return { data: await OpsSettingsService.get() };
});

export const PATCH = opsMutation('approve', UpdateOpsSettingsSchema, async ({ input, actor, payload }) => {
  // Settings are company-wide, so this is deliberately narrower than the rest of
  // the desk: super_admin and admin only.
  if (payload.role !== 'admin' && payload.role !== 'super_admin') {
    throw new OpsRouteError('AUTH_006', 403, 'Only an administrator can change ops settings.');
  }
  return { data: await OpsSettingsService.update(input, actor.userId) };
});
