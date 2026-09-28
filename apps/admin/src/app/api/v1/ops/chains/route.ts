/**
 * Chain list and creation (Phase 30.02).
 *
 * The list is scope-filtered inside ChainService, so an executive automatically
 * sees only their own chains without this route knowing about roles.
 */
import { ChainService } from '@services/ops/ChainService';
import { ListChainsSchema, CreateChainSchema } from '@validators/ops/chain';
import { opsQuery, opsMutation } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', ListChainsSchema, async ({ input, actor }) => {
  const result = await ChainService.list(input, actor);
  return { list: result.data, pagination: result.pagination };
});

export const POST = opsMutation('workdesk', CreateChainSchema, async ({ input, actor }) => {
  return { created: await ChainService.create(input, actor) };
});
