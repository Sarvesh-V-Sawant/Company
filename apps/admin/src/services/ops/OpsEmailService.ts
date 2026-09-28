/**
 * Work Desk outbound email (Phase 30.04).
 *
 * Implements the flow you specified: a free-text recipient field, a choice of
 * PDF or Excel attachment, a DRAFT that is visible and editable before anything
 * is sent, and a visible status afterwards. Nothing is sent implicitly — drafting
 * and sending are two separate calls, so the preview the user approves is the
 * message that leaves.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { AuditLog } from '@models/AuditLog';
import { EmailLog } from '@models/ops/EmailLog';
import { Chain } from '@models/ops/Chain';
import { ChainEvent } from '@models/ops/ChainEvent';
import { Canteen } from '@models/ops/Canteen';
import { Manufacturer } from '@models/ops/Manufacturer';
import { ChainDocument } from '@models/ops/ChainDocument';
import { OpsSettingsService } from '@services/ops/OpsSettingsService';
import { AlteredOrderService } from '@services/ops/AlteredOrderService';
import { readDocumentBytes } from '@services/ops/DocumentVaultService';
import { calcSkip } from '@lib/utils/pagination';
import {
  sendTransactionalEmail,
  EmailProviderError,
} from '@lib/email/brevo';
import { escapeRegExp } from '@lib/utils/regex';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Converts the plain-text body template into simple, safe HTML. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, '<br />')}</p>`)
    .join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5;">${paragraphs}</div>`;
}

export interface DraftEmailInput {
  chainId: string;
  toEmails: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  subject?: string;
  bodyText?: string;
  /** Attachment format for the altered order. */
  attachmentFormat?: 'pdf' | 'xlsx' | 'none';
  /** Attach specific existing vault documents instead of generating one. */
  documentIds?: string[];
}

export class OpsEmailService {
  /**
   * Builds a draft. The subject/body default to the Ops Settings templates with
   * chain tokens filled in, but the caller may override both, which is what the
   * free-text compose box does.
   */
  static async createDraft(input: DraftEmailInput, actorId: string) {
    await connectDB();

    const chain = await Chain.findById(input.chainId);
    if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

    if (input.toEmails.length === 0) {
      throw new AppError('OPS_045', 422, 'At least one recipient email is required.');
    }

    const [canteen, manufacturer, settings] = await Promise.all([
      Canteen.findById(chain.canteenId).select('code name').lean<{ code: string; name: string }>(),
      Manufacturer.findById(chain.manufacturerId).select('code name').lean<{ code: string; name: string }>(),
      OpsSettingsService.get(),
    ]);

    const tokens: Record<string, string> = {
      chainNumber: chain.chainNumber,
      canteenName: canteen?.name ?? '',
      canteenCode: canteen?.code ?? '',
      manufacturerName: manufacturer?.name ?? '',
      manufacturerCode: manufacturer?.code ?? '',
      sourcePoNumber: chain.sourcePoNumber ?? '',
      alteredOrderValue:
        chain.alteredOrderValue === undefined ? '' : chain.alteredOrderValue.toFixed(2),
    };

    const subject =
      input.subject?.trim() ||
      OpsSettingsService.renderTemplate(settings.alteredOrderEmailSubject, tokens);
    const bodyText =
      input.bodyText?.trim() ||
      OpsSettingsService.renderTemplate(settings.alteredOrderEmailBody, tokens);

    // Resolve attachments now so the draft preview shows exactly what will go.
    const attachments: Array<{
      fileName: string;
      format: 'pdf' | 'xlsx';
      documentId?: string;
    }> = [];

    if (input.documentIds?.length) {
      const docs = await ChainDocument.find({
        _id: { $in: input.documentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        chainId: chain._id,
        isDeleted: false,
      }).lean<Array<{ _id: mongoose.Types.ObjectId; fileName: string; mimeType: string }>>();

      if (docs.length !== input.documentIds.length) {
        throw new AppError('OPS_041', 404, 'One or more selected documents were not found on this chain.');
      }
      for (const d of docs) {
        attachments.push({
          fileName: d.fileName,
          format: d.mimeType === XLSX_MIME ? 'xlsx' : 'pdf',
          documentId: String(d._id),
        });
      }
    } else if (input.attachmentFormat && input.attachmentFormat !== 'none') {
      // Generate and file the altered order, then attach that stored version, so
      // what the manufacturer receives is byte-identical to what is on record.
      const generated = await AlteredOrderService.generateAndStore(
        input.chainId,
        input.attachmentFormat,
        actorId,
      );
      attachments.push({
        fileName: generated.fileName,
        format: input.attachmentFormat,
        documentId: generated.documentId,
      });
    }

    const draft = await EmailLog.create({
      chainId: chain._id,
      toEmails: input.toEmails,
      ccEmails: input.ccEmails ?? [],
      bccEmails: input.bccEmails ?? [],
      subject,
      bodyHtml: textToHtml(bodyText),
      bodyText,
      attachments,
      status: 'draft',
    });

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(actorId),
      action: 'ops.email.draft',
      targetType: 'EmailLog',
      targetId: String(draft._id),
    });

    return draft;
  }

  /** Edits a draft. Sent messages are immutable. */
  static async updateDraft(
    emailId: string,
    data: Partial<Pick<DraftEmailInput, 'toEmails' | 'ccEmails' | 'bccEmails' | 'subject'>> & {
      bodyText?: string;
    },
    actorId: string,
  ) {
    await connectDB();

    const draft = await EmailLog.findById(emailId);
    if (!draft) throw new AppError('OPS_041', 404, 'Email draft not found.');
    if (draft.status !== 'draft') {
      throw new AppError('OPS_046', 409, 'This email has already been sent and cannot be edited.');
    }

    if (data.toEmails) {
      if (data.toEmails.length === 0) {
        throw new AppError('OPS_045', 422, 'At least one recipient email is required.');
      }
      draft.toEmails = data.toEmails;
    }
    if (data.ccEmails) draft.ccEmails = data.ccEmails;
    if (data.bccEmails) draft.bccEmails = data.bccEmails;
    if (data.subject !== undefined) draft.subject = data.subject;
    if (data.bodyText !== undefined) {
      draft.bodyText = data.bodyText;
      draft.bodyHtml = textToHtml(data.bodyText);
    }

    await draft.save();

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(actorId),
      action: 'ops.email.draft.update',
      targetType: 'EmailLog',
      targetId: String(draft._id),
    });

    return draft;
  }

  /**
   * Sends a draft. Status moves draft → queued → sent|failed, and a provider
   * failure is recorded on the log rather than thrown away, so the desk shows a
   * real reason instead of a silent non-delivery.
   */
  static async send(emailId: string, actorId: string) {
    await connectDB();

    const draft = await EmailLog.findById(emailId);
    if (!draft) throw new AppError('OPS_041', 404, 'Email draft not found.');
    if (draft.status === 'sent') {
      throw new AppError('OPS_046', 409, 'This email has already been sent.');
    }
    if (draft.toEmails.length === 0) {
      throw new AppError('OPS_045', 422, 'At least one recipient email is required.');
    }

    const actorOid = new mongoose.Types.ObjectId(actorId);

    // Load attachment bytes before flipping to `queued`, so a missing file fails
    // the send while the draft is still editable.
    const payloadAttachments: Array<{ name: string; content: string }> = [];
    for (const att of draft.attachments ?? []) {
      if (!att.documentId) continue;
      const file = await readDocumentBytes(String(att.documentId));
      payloadAttachments.push({
        name: file.fileName,
        content: Buffer.from(file.bytes).toString('base64'),
      });
    }

    draft.status = 'queued';
    draft.sentBy = actorOid;
    await draft.save();

    try {
      const result = await sendTransactionalEmail({
        to: draft.toEmails,
        cc: draft.ccEmails,
        bcc: draft.bccEmails,
        subject: draft.subject,
        htmlContent: draft.bodyHtml,
        textContent: draft.bodyText,
        attachments: payloadAttachments,
      });

      draft.status = 'sent';
      draft.sentAt = new Date();
      draft.providerMessageId = result.messageId;
      draft.errorMessage = undefined;
      await draft.save();
    } catch (err) {
      draft.status = 'failed';
      draft.errorMessage =
        err instanceof EmailProviderError
          ? err.message
          : 'The email could not be sent. Please retry.';
      await draft.save();

      throw new AppError(
        'OPS_047',
        502,
        `${draft.errorMessage} The draft has been kept so you can retry.`,
      );
    }

    if (draft.chainId) {
      await ChainEvent.create({
        chainId: draft.chainId,
        eventType: 'EMAIL_SENT',
        message: `Email sent to ${draft.toEmails.join(', ')}`,
        metadata: {
          emailId: String(draft._id),
          subject: draft.subject,
          attachmentCount: payloadAttachments.length,
        },
        actorUserId: actorOid,
      });
    }

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.email.send',
      targetType: 'EmailLog',
      targetId: String(draft._id),
    });

    return draft;
  }

  static async getById(emailId: string) {
    await connectDB();
    const email = await EmailLog.findById(emailId)
      .populate('chainId', 'chainNumber status')
      .populate('sentBy', 'firstName lastName email')
      .lean();
    if (!email) throw new AppError('OPS_041', 404, 'Email not found.');
    return email;
  }

  static async list(params: {
    page: number;
    limit: number;
    chainId?: string;
    status?: string;
    search?: string;
  }) {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (params.chainId) filter.chainId = new mongoose.Types.ObjectId(params.chainId);
    if (params.status) filter.status = params.status;
    if (params.search) {
      // escapeRegExp prevents the ReDoS/injection class of bug found in 30.01.
      const rx = new RegExp(escapeRegExp(params.search), 'i');
      filter.$or = [{ subject: rx }, { toEmails: rx }];
    }

    const [data, total] = await Promise.all([
      EmailLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(calcSkip({ page: params.page, limit: params.limit }))
        .limit(params.limit)
        .populate('chainId', 'chainNumber status')
        .populate('sentBy', 'firstName lastName email')
        .lean(),
      EmailLog.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }

  /** Deletes a draft. Sent mail is never deletable, for audit reasons. */
  static async discardDraft(emailId: string, actorId: string): Promise<void> {
    await connectDB();
    const draft = await EmailLog.findById(emailId);
    if (!draft) throw new AppError('OPS_041', 404, 'Email draft not found.');
    if (draft.status === 'sent') {
      throw new AppError('OPS_046', 409, 'Sent email is kept for audit and cannot be deleted.');
    }
    await EmailLog.findByIdAndDelete(emailId);

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(actorId),
      action: 'ops.email.draft.discard',
      targetType: 'EmailLog',
      targetId: emailId,
    });
  }
}
