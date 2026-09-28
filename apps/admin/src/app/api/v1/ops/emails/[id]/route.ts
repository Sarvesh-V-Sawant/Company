/**
 * Read, edit or discard a single email (Phase 30.04).
 * Sent mail is immutable and undeletable, for audit reasons.
 */
import { OpsEmailService } from '@services/ops/OpsEmailService';
import { UpdateDraftEmailSchema } from '@validators/ops/chain';
import { opsQuery, opsMutation, requireIdParam } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', null, async ({ params }) => {
  const id = requireIdParam(params);
  return { data: await OpsEmailService.getById(id) };
});

export const PATCH = opsMutation('workdesk', UpdateDraftEmailSchema, async ({ input, actor, params }) => {
  const id = requireIdParam(params);
  return {
    data: await OpsEmailService.updateDraft(
      id,
      {
        toEmails: input.toEmails,
        ccEmails: input.ccEmails,
        bccEmails: input.bccEmails,
        subject: input.subject,
        bodyText: input.bodyText,
      },
      actor.userId,
    ),
  };
});

export const DELETE = opsMutation('workdesk', null, async ({ actor, params }) => {
  const id = requireIdParam(params);
  await OpsEmailService.discardDraft(id, actor.userId);
  return { data: { id, discarded: true } };
});
