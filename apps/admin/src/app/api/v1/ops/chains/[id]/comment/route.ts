/**
 * Add a comment to the chain timeline (Phase 30.03).
 */
import { ChainService } from '@services/ops/ChainService';
import { ChainCommentSchema } from '@validators/ops/chain';
import { opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const POST = opsMutation('workdesk', ChainCommentSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return { created: await ChainService.addComment(id, input.message, actor) };
});
