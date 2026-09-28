/**
 * Commission preview, raise and receipt (Phase 30.08).
 *
 *   GET    preview the computed commission without writing anything
 *   POST   raise the invoice (approval-grade)
 *   PATCH  record receipt of the commission
 */
import { CommissionService } from '@services/ops/CommissionService';
import { ChainService } from '@services/ops/ChainService';
import { RaiseCommissionSchema, ReceiveCommissionSchema } from '@validators/ops/chain';
import { opsQuery, opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', null, async ({ actor, params }) => {
  const id = requireIdParam(params);
  // loadForActor first so an out-of-scope chain 404s rather than leaking numbers.
  await ChainService.loadForActor(id, actor);
  return { data: await CommissionService.compute(id) };
});

export const POST = opsMutation('approve', RaiseCommissionSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  await ChainService.loadForActor(id, actor);
  return {
    created: await CommissionService.raise(id, actor.userId, input.overrideAmount, input.note),
  };
});

export const PATCH = opsMutation('approve', ReceiveCommissionSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  await ChainService.loadForActor(id, actor);
  return { data: await CommissionService.recordReceipt(id, input, actor.userId) };
});
