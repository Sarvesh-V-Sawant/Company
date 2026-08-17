/**
 * Email list and draft creation (Phase 30.04).
 *
 * Drafting and sending are separate endpoints on purpose: you asked to see the
 * draft before anything leaves.
 */
import { OpsEmailService } from '@services/ops/OpsEmailService';
import { ChainService } from '@services/ops/ChainService';
import { ListEmailsSchema, CreateDraftEmailSchema } from '@validators/ops/chain';
import { opsQuery, opsMutation, OpsRouteError } from '@lib/utils/ops-route';

export const dynamic = 'force-dynamic';

export const GET = opsQuery('workdesk', ListEmailsSchema, async ({ input }) => {
  const result = await OpsEmailService.list({
    page: input.page,
    limit: input.limit,
    chainId: input.chainId,
    status: input.status,
    search: input.search,
  });
  return { list: result.data, pagination: result.pagination };
});

export const POST = opsMutation(
  'workdesk',
  CreateDraftEmailSchema,
  async ({ input, actor }) => {
    // Scope check before drafting, so a draft cannot be created against a chain
    // the user cannot see.
    await ChainService.loadForActor(input.chainId, actor);

    if (input.attachDocumentId && input.attachFormat) {
      throw new OpsRouteError(
        'GEN_001',
        400,
        'Choose either an existing document or a format to generate, not both.',
      );
    }

    const draft = await OpsEmailService.createDraft(
      {
        chainId: input.chainId,
        toEmails: input.toEmails,
        ccEmails: input.ccEmails,
        bccEmails: input.bccEmails,
        subject: input.subject,
        bodyText: input.bodyText,
        attachmentFormat: input.attachFormat ?? 'none',
        documentIds: input.attachDocumentId ? [input.attachDocumentId] : undefined,
      },
      actor.userId,
    );

    return { created: draft };
  },
);
