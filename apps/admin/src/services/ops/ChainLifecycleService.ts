/**
 * Chain lifecycle recording (Phases 30.06–30.08).
 *
 * Each method records a real-world event and then advances the status machine.
 * Recording and transitioning are always done together so the data and the
 * status can never disagree — that disagreement is what makes a pipeline board
 * untrustworthy.
 *
 * Every method routes through ChainService.loadForActor, so row-level scope and
 * the closed/cancelled guard apply here exactly as they do elsewhere.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { AuditLog } from '@models/AuditLog';
import { Chain, type IChain } from '@models/ops/Chain';
import { ChainLineItem } from '@models/ops/ChainLineItem';
import { ChainEvent } from '@models/ops/ChainEvent';
import { ChainService, round2, type ChainActor } from '@services/ops/ChainService';
import type { ChainStatus } from '@services/ops/ChainStatusMachine';

/**
 * Statuses from which a tax invoice may be recorded. TAX_INVOICE_RECEIVED is
 * only a legal machine target from AWAITING_TAX_INVOICE, so recording from
 * SENT_TO_MANUFACTURER absorbs the SENT_TO_MANUFACTURER -> AWAITING_TAX_INVOICE
 * hop first (each hop still goes through ChainService.changeStatus, i.e.
 * canTransition() — no edge is ever skipped or hardcoded).
 */
const TAX_INVOICE_FROM: ChainStatus[] = ['SENT_TO_MANUFACTURER', 'AWAITING_TAX_INVOICE'];

async function logEvent(
  chain: IChain,
  actor: ChainActor,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await ChainEvent.create({
    chainId: chain._id,
    eventType: 'COMMENT',
    message,
    metadata,
    actorUserId: new mongoose.Types.ObjectId(actor.userId),
  });
}

async function audit(
  action: string,
  chainId: string,
  actor: ChainActor,
  after: Record<string, unknown>,
): Promise<void> {
  await AuditLog.create({
    performedBy: new mongoose.Types.ObjectId(actor.userId),
    action,
    targetType: 'Chain',
    targetId: chainId,
    changes: { after },
  });
}

export class ChainLifecycleService {
  /**
   * Records the manufacturer's tax invoice. This is the document that later gets
   * uploaded to the canteen's portal, so it is required before any portal step.
   */
  static async recordTaxInvoice(
    chainId: string,
    data: { taxInvoiceNumber: string; taxInvoiceDate: Date; taxInvoiceValue: number },
    actor: ChainActor,
  ) {
    const chain = await ChainService.loadForActor(chainId, actor);
    const status = chain.status as ChainStatus;

    if (!TAX_INVOICE_FROM.includes(status) && status !== 'TAX_INVOICE_RECEIVED') {
      throw new AppError(
        'OPS_048',
        409,
        `A tax invoice can only be recorded once the order has been sent to the manufacturer. Current status: ${status}.`,
      );
    }

    // Absorb the SENT_TO_MANUFACTURER -> AWAITING_TAX_INVOICE hop as a real,
    // separately-logged transition (not a silent skip) before recording the
    // invoice. changeStatus() re-validates via canTransition() itself, so an
    // illegal edge still throws the coded OPS_032, never a raw Error.
    if (status === 'SENT_TO_MANUFACTURER') {
      await ChainService.changeStatus(
        chainId,
        'AWAITING_TAX_INVOICE',
        actor,
        'Awaiting tax invoice from manufacturer',
      );
    }

    chain.taxInvoiceNumber = data.taxInvoiceNumber.trim();
    chain.taxInvoiceDate = data.taxInvoiceDate;
    chain.taxInvoiceValue = round2(data.taxInvoiceValue);
    chain.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await chain.save();

    await logEvent(chain, actor, `Tax invoice ${chain.taxInvoiceNumber} recorded`, {
      taxInvoiceNumber: chain.taxInvoiceNumber,
      taxInvoiceValue: chain.taxInvoiceValue,
    });
    await audit('ops.chain.taxInvoice.record', chainId, actor, {
      taxInvoiceNumber: chain.taxInvoiceNumber,
    });

    // Advance only when not already there, so re-recording a correction is safe.
    if (status !== 'TAX_INVOICE_RECEIVED') {
      await ChainService.changeStatus(
        chainId,
        'TAX_INVOICE_RECEIVED',
        actor,
        `Tax invoice ${chain.taxInvoiceNumber} received`,
      );
    }

    return ChainService.getById(chainId, actor);
  }

  /** Records that the tax invoice was uploaded to the canteen's portal. */
  static async recordPortalUpload(
    chainId: string,
    data: { portalUploadedAt?: Date; note?: string },
    actor: ChainActor,
  ) {
    const chain = await ChainService.loadForActor(chainId, actor);

    if (!chain.taxInvoiceNumber) {
      throw new AppError(
        'OPS_048',
        422,
        'Record the manufacturer\'s tax invoice before marking it uploaded to the portal.',
      );
    }

    chain.portalUploadedAt = data.portalUploadedAt ?? new Date();
    chain.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await chain.save();

    await logEvent(chain, actor, 'Tax invoice uploaded to the canteen portal', {
      portalUploadedAt: chain.portalUploadedAt,
      note: data.note,
    });
    await audit('ops.chain.portal.upload', chainId, actor, {
      portalUploadedAt: chain.portalUploadedAt,
    });

    if (chain.status !== 'UPLOADED_ON_PORTAL') {
      await ChainService.changeStatus(
        chainId,
        'UPLOADED_ON_PORTAL',
        actor,
        data.note ?? 'Uploaded on portal',
      );
    }

    return ChainService.getById(chainId, actor);
  }

  /** Records the portal's approval or rejection of the uploaded invoice. */
  static async recordPortalDecision(
    chainId: string,
    data: { decision: 'approved' | 'rejected'; note?: string },
    actor: ChainActor,
  ) {
    const chain = await ChainService.loadForActor(chainId, actor);

    if (!chain.portalUploadedAt) {
      throw new AppError(
        'OPS_049',
        422,
        'Mark the tax invoice as uploaded before recording the portal decision.',
      );
    }

    const actorOid = new mongoose.Types.ObjectId(actor.userId);

    if (data.decision === 'approved') {
      chain.portalApprovedAt = new Date();
      chain.updatedBy = actorOid;
      await chain.save();

      await logEvent(chain, actor, 'Portal approved the uploaded tax invoice', {
        note: data.note,
      });
      await audit('ops.chain.portal.approve', chainId, actor, {
        portalApprovedAt: chain.portalApprovedAt,
      });

      await ChainService.changeStatus(chainId, 'PORTAL_APPROVED', actor, data.note ?? 'Portal approved');
    } else {
      // A rejection deliberately clears the approval stamp, so a later SO cannot
      // be recorded against a stale approval.
      chain.portalApprovedAt = undefined;
      chain.updatedBy = actorOid;
      await chain.save();

      await logEvent(chain, actor, `Portal rejected the upload: ${data.note ?? 'no reason given'}`, {
        note: data.note,
      });
      await audit('ops.chain.portal.reject', chainId, actor, { note: data.note });

      await ChainService.changeStatus(
        chainId,
        'REJECTED_ON_PORTAL',
        actor,
        data.note ?? 'Rejected on portal',
      );
    }

    return ChainService.getById(chainId, actor);
  }

  /** Records the sales order the manufacturer issues after portal approval. */
  static async recordSalesOrder(
    chainId: string,
    data: { soNumber: string; soDate: Date },
    actor: ChainActor,
  ) {
    const chain = await ChainService.loadForActor(chainId, actor);

    if (!chain.portalApprovedAt) {
      throw new AppError(
        'OPS_049',
        422,
        'A sales order can only be recorded after the portal has approved the tax invoice.',
      );
    }

    chain.soNumber = data.soNumber.trim();
    chain.soDate = data.soDate;
    chain.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await chain.save();

    await logEvent(chain, actor, `Sales order ${chain.soNumber} received`, {
      soNumber: chain.soNumber,
      soDate: chain.soDate,
    });
    await audit('ops.chain.salesOrder.record', chainId, actor, { soNumber: chain.soNumber });

    if (chain.status !== 'SO_RECEIVED') {
      await ChainService.changeStatus(chainId, 'SO_RECEIVED', actor, `SO ${chain.soNumber} received`);
    }

    return ChainService.getById(chainId, actor);
  }

  /** Records dispatch details and moves the chain into transit. */
  static async recordDispatch(
    chainId: string,
    data: {
      transporter?: string;
      lrNumber?: string;
      ewayBillNumber?: string;
      dispatchedAt: Date;
      expectedDeliveryAt?: Date;
    },
    actor: ChainActor,
  ) {
    const chain = await ChainService.loadForActor(chainId, actor);

    if (!chain.soNumber) {
      throw new AppError(
        'OPS_050',
        422,
        'Record the sales order before recording dispatch.',
      );
    }

    chain.dispatch = {
      transporter: data.transporter,
      lrNumber: data.lrNumber,
      ewayBillNumber: data.ewayBillNumber,
      dispatchedAt: data.dispatchedAt,
      expectedDeliveryAt: data.expectedDeliveryAt,
    };
    chain.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await chain.save();

    await logEvent(
      chain,
      actor,
      `Dispatched${data.transporter ? ` via ${data.transporter}` : ''}${data.lrNumber ? `, LR ${data.lrNumber}` : ''}`,
      { ...data },
    );
    await audit('ops.chain.dispatch.record', chainId, actor, { lrNumber: data.lrNumber });

    if (chain.status !== 'IN_TRANSIT') {
      await ChainService.changeStatus(chainId, 'IN_TRANSIT', actor, 'Goods dispatched');
    }

    return ChainService.getById(chainId, actor);
  }

  /**
   * Records delivery, per line where provided. The resulting status is derived
   * from the numbers rather than chosen by the user:
   *   nothing short            → DELIVERED
   *   some lines fully short   → SHORT_SUPPLIED
   *   some lines partly short  → PARTIALLY_DELIVERED
   */
  static async recordDelivery(
    chainId: string,
    data: {
      deliveredAt: Date;
      lines?: Array<{ lineId: string; deliveredQty: number }>;
      note?: string;
    },
    actor: ChainActor,
  ) {
    await connectDB();
    const chain = await ChainService.loadForActor(chainId, actor);

    if (!chain.dispatch?.dispatchedAt) {
      throw new AppError('OPS_050', 422, 'Record dispatch before recording delivery.');
    }

    const lines = await ChainLineItem.find({ chainId: chain._id }).select('alteredQty');
    if (lines.length === 0) {
      throw new AppError('OPS_037', 422, 'This chain has no line items.');
    }

    const byId = new Map(lines.map((l) => [String(l._id), l]));
    const supplied = new Map<string, number>();

    for (const entry of data.lines ?? []) {
      const line = byId.get(entry.lineId);
      if (!line) {
        throw new AppError('OPS_030', 422, 'One of the submitted line IDs does not belong to this chain.');
      }
      if (entry.deliveredQty > line.alteredQty) {
        throw new AppError(
          'OPS_051',
          422,
          `Delivered quantity (${entry.deliveredQty}) cannot exceed the agreed quantity (${line.alteredQty}).`,
        );
      }
      supplied.set(entry.lineId, entry.deliveredQty);
    }

    let fullyShortLines = 0;
    let partiallyShortLines = 0;

    for (const line of lines) {
      // Lines the user did not mention are treated as fully delivered.
      const delivered = supplied.has(String(line._id))
        ? supplied.get(String(line._id))!
        : line.alteredQty;
      const short = round2(Math.max(0, line.alteredQty - delivered));

      line.deliveredQty = delivered;
      line.shortSuppliedQty = short;
      await line.save();

      if (short > 0) {
        if (delivered === 0) fullyShortLines += 1;
        else partiallyShortLines += 1;
      }
    }

    chain.deliveredAt = data.deliveredAt;
    chain.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await chain.save();

    const toStatus: ChainStatus =
      fullyShortLines === 0 && partiallyShortLines === 0
        ? 'DELIVERED'
        : fullyShortLines > 0
          ? 'SHORT_SUPPLIED'
          : 'PARTIALLY_DELIVERED';

    await logEvent(
      chain,
      actor,
      `Delivery recorded (${toStatus.replace(/_/g, ' ').toLowerCase()})`,
      { fullyShortLines, partiallyShortLines, note: data.note },
    );
    await audit('ops.chain.delivery.record', chainId, actor, {
      deliveredAt: data.deliveredAt,
      toStatus,
    });

    if (chain.status !== toStatus) {
      await ChainService.changeStatus(chainId, toStatus, actor, data.note ?? 'Delivery recorded');
    }

    return ChainService.getById(chainId, actor);
  }

  /** Records the canteen's payment to the manufacturer. */
  static async recordPayment(
    chainId: string,
    data: {
      status: 'pending' | 'partial' | 'paid';
      amount: number;
      paidAt?: Date;
      referenceNo?: string;
    },
    actor: ChainActor,
  ) {
    const chain = await ChainService.loadForActor(chainId, actor);

    if (!chain.deliveredAt) {
      throw new AppError(
        'OPS_052',
        422,
        'Record delivery before recording the canteen\'s payment.',
      );
    }

    chain.canteenPayment = {
      status: data.status,
      amount: round2(data.amount),
      paidAt: data.paidAt,
      referenceNo: data.referenceNo,
    };
    chain.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await chain.save();

    await logEvent(
      chain,
      actor,
      `Canteen payment recorded as ${data.status}${data.referenceNo ? ` (ref ${data.referenceNo})` : ''}`,
      { ...data },
    );
    await audit('ops.chain.payment.record', chainId, actor, { status: data.status });

    // Only a full payment advances the chain; partial keeps it pending on purpose,
    // because commission is raised against a completed collection.
    const target: ChainStatus = data.status === 'paid' ? 'PAYMENT_RECEIVED' : 'PAYMENT_PENDING';
    if (chain.status !== target) {
      await ChainService.changeStatus(chainId, target, actor, `Payment ${data.status}`);
    }

    return ChainService.getById(chainId, actor);
  }

  /** Closes a chain once commission has been received. */
  static async close(chainId: string, actor: ChainActor, note?: string) {
    const chain = await ChainService.loadForActor(chainId, actor);

    if (!chain.commission?.receivedAt) {
      throw new AppError(
        'OPS_054',
        422,
        'A chain can only be closed after the commission has been received.',
      );
    }

    await ChainService.changeStatus(chainId, 'CLOSED', actor, note ?? 'Chain closed');
    await audit('ops.chain.close', chainId, actor, { closedAt: new Date() });

    return ChainService.getById(chainId, actor);
  }
}
