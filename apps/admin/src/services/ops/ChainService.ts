/**
 * Chain lifecycle service (Phases 30.02–30.08).
 *
 * Follows the established masters-service shape: static class, connectDB() first,
 * AppError with an OPS_* code, AuditLog on every mutation, ChainEvent for the
 * chain's own timeline.
 *
 * Scope: executives may only see and act on chains assigned to them. This reuses
 * chainScopeFilter() from lib/permissions/can.ts, which previously had zero call
 * sites — it now has real ones.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { AuditLog } from '@models/AuditLog';
import { Chain, type IChain } from '@models/ops/Chain';
import { ChainLineItem, type IChainLineItem } from '@models/ops/ChainLineItem';
import { ChainEvent } from '@models/ops/ChainEvent';
import { Canteen, type ICanteen } from '@models/ops/Canteen';
import { Manufacturer, type IManufacturer } from '@models/ops/Manufacturer';
import { OpsAddress, type IOpsAddress } from '@models/ops/OpsAddress';
import { User } from '@models/User';
import { generateChainNumber } from '@services/ops/ChainNumberService';
import {
  canTransition,
  getAllowedTransitions,
  type ChainStatus,
} from '@services/ops/ChainStatusMachine';
import { calcSkip } from '@lib/utils/pagination';
import { escapeRegExp } from '@lib/utils/regex';
import { chainScopeFilter } from '@lib/permissions/can';
import type { UserRole } from '@app-types/enums';

const MONGO_ID_RE = /^[0-9a-f]{24}$/i;

/** Statuses after which the commercial content of the chain is frozen. */
const LINES_LOCKED_AFTER: ChainStatus[] = [
  'SENT_TO_MANUFACTURER', 'AWAITING_TAX_INVOICE', 'TAX_INVOICE_RECEIVED',
  'UPLOADED_ON_PORTAL', 'PORTAL_APPROVED', 'SO_RECEIVED', 'IN_TRANSIT',
  'DELIVERED', 'PARTIALLY_DELIVERED', 'SHORT_SUPPLIED', 'PAYMENT_PENDING',
  'PAYMENT_RECEIVED', 'COMMISSION_RAISED', 'COMMISSION_RECEIVED', 'CLOSED',
  'CANCELLED',
];

const TERMINAL_STATUSES: ChainStatus[] = ['CLOSED', 'CANCELLED'];

/** Maps the inbox page buckets onto concrete status sets. */
const BUCKET_STATUSES: Record<string, ChainStatus[]> = {
  po: ['PO_RECEIVED', 'UNDER_REVIEW'],
  altered: ['ALTERED', 'PENDING_INTERNAL_APPROVAL'],
  taxInvoice: ['SENT_TO_MANUFACTURER', 'AWAITING_TAX_INVOICE', 'TAX_INVOICE_RECEIVED'],
  portal: ['UPLOADED_ON_PORTAL', 'PORTAL_APPROVED', 'REJECTED_ON_PORTAL'],
  so: ['PORTAL_APPROVED', 'SO_RECEIVED'],
  transit: ['IN_TRANSIT', 'PARTIALLY_DELIVERED', 'SHORT_SUPPLIED', 'DELIVERED'],
  payment: ['PAYMENT_PENDING', 'PAYMENT_RECEIVED'],
  commission: ['COMMISSION_RAISED', 'COMMISSION_RECEIVED'],
  closed: ['CLOSED', 'CANCELLED'],
};

export interface ChainActor {
  userId: string;
  role: UserRole;
}

export interface ComputedLineTotals {
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
}

/** Rounds to 2 dp using integer paise arithmetic to avoid float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Single source of truth for line money. Used by the line editor, the altered
 * order document, and the commission base so the three can never disagree.
 */
export function computeLineTotals(params: {
  alteredQty: number;
  rate?: number;
  gstRatePercent?: number;
}): ComputedLineTotals {
  const rate = params.rate ?? 0;
  const taxable = round2(params.alteredQty * rate);
  const gst = params.gstRatePercent ?? 0;
  const tax = round2((taxable * gst) / 100);
  return { taxableValue: taxable, taxAmount: tax, lineTotal: round2(taxable + tax) };
}

function assertChainId(id: string): void {
  if (!MONGO_ID_RE.test(id)) throw new AppError('OPS_030', 400, 'Invalid chain ID.');
}

export class ChainService {
  /** Loads a chain or throws. Enforces executive assignment scope. */
  static async loadForActor(chainId: string, actor: ChainActor): Promise<IChain> {
    await connectDB();
    assertChainId(chainId);
    const chain = await Chain.findById(chainId);
    if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

    const scope = chainScopeFilter(actor.role, actor.userId);
    if (scope.assignedTo && String(chain.assignedTo ?? '') !== actor.userId) {
      throw new AppError('OPS_057', 403, 'This chain is not assigned to you.');
    }
    return chain;
  }

  private static assertMutable(chain: IChain): void {
    if (TERMINAL_STATUSES.includes(chain.status as ChainStatus)) {
      throw new AppError(
        'OPS_033',
        409,
        `Chain is ${chain.status} and can no longer be modified.`,
      );
    }
  }

  static linesEditable(status: ChainStatus): boolean {
    return !LINES_LOCKED_AFTER.includes(status);
  }

  // ─── List ──────────────────────────────────────────────────────────

  static async list(
    params: {
      page: number; limit: number; search?: string; sortBy: string; sortOrder: 'asc' | 'desc';
      status?: ChainStatus; canteenId?: string; manufacturerId?: string; assignedTo?: string;
      bucket?: string; onHold?: boolean; fromDate?: Date; toDate?: Date; isActive?: boolean;
    },
    actor: ChainActor,
  ) {
    await connectDB();

    const filter: Record<string, unknown> = { ...chainScopeFilter(actor.role, actor.userId) };

    if (params.status) {
      filter.status = params.status;
    } else if (params.bucket) {
      if (params.bucket === 'open') {
        filter.status = { $nin: TERMINAL_STATUSES };
      } else {
        const statuses = BUCKET_STATUSES[params.bucket];
        if (statuses) filter.status = { $in: statuses };
      }
    }

    if (params.canteenId) filter.canteenId = new mongoose.Types.ObjectId(params.canteenId);
    if (params.manufacturerId) filter.manufacturerId = new mongoose.Types.ObjectId(params.manufacturerId);
    if (params.assignedTo) filter.assignedTo = new mongoose.Types.ObjectId(params.assignedTo);
    if (params.onHold !== undefined) filter.isOnHold = params.onHold;

    if (params.fromDate || params.toDate) {
      const range: Record<string, Date> = {};
      if (params.fromDate) range.$gte = params.fromDate;
      if (params.toDate) range.$lte = params.toDate;
      filter.createdAt = range;
    }

    // Search covers the chain number and the source PO number. Both are escaped.
    if (params.search) {
      const re = new RegExp(escapeRegExp(params.search), 'i');
      filter.$or = [{ chainNumber: re }, { sourcePoNumber: re }];
    }

    const sort: Record<string, 1 | -1> = { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 };
    const skip = calcSkip({ page: params.page, limit: params.limit });

    const [rows, total] = await Promise.all([
      Chain.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(params.limit)
        .populate('canteenId', 'code name type')
        .populate('manufacturerId', 'code name')
        .populate('assignedTo', 'firstName lastName email')
        .lean(),
      Chain.countDocuments(filter),
    ]);

    return {
      data: rows,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.max(1, Math.ceil(total / params.limit)),
      },
    };
  }

  // ─── Read one ─────────────────────────────────────────────────────

  static async getById(chainId: string, actor: ChainActor) {
    const chain = await this.loadForActor(chainId, actor);
    const oid = chain._id as mongoose.Types.ObjectId;

    const [lines, events, populated] = await Promise.all([
      ChainLineItem.find({ chainId: oid })
        .sort({ sortOrder: 1 })
        .populate('productId', 'sku name uom packSize gstRatePercent')
        .lean(),
      ChainEvent.find({ chainId: oid })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate('actorUserId', 'firstName lastName email')
        .lean(),
      Chain.findById(oid)
        .populate('canteenId', 'code name type gstin parentCanteenId')
        .populate('originCanteenId', 'code name type')
        .populate('manufacturerId', 'code name gstin primaryEmail contactPerson phone')
        .populate('shipToAddressId')
        .populate('billToAddressId')
        .populate('assignedTo', 'firstName lastName email role')
        .lean(),
    ]);

    const totals = lines.reduce(
      (acc, l) => {
        const line = l as unknown as IChainLineItem;
        acc.taxableValue = round2(acc.taxableValue + (line.taxableValue ?? 0));
        acc.taxAmount = round2(acc.taxAmount + (line.taxAmount ?? 0));
        acc.lineTotal = round2(acc.lineTotal + (line.lineTotal ?? 0));
        return acc;
      },
      { taxableValue: 0, taxAmount: 0, lineTotal: 0 },
    );

    return {
      ...(populated as Record<string, unknown>),
      lines,
      events,
      totals,
      allowedTransitions: getAllowedTransitions(chain.status as ChainStatus),
      linesEditable: this.linesEditable(chain.status as ChainStatus),
    };
  }

  // ─── Create ───────────────────────────────────────────────────────

  static async create(
    data: {
      canteenId: string; manufacturerId: string; originCanteenId?: string;
      shipToAddressId?: string; billToAddressId?: string;
      sourcePoNumber?: string; sourcePoDate?: Date; assignedTo?: string;
      lines?: Array<{
        productId?: string; rawDescription?: string; uom: string; packSize?: number;
        originalQty: number; alteredQty: number; varianceReason?: string;
        varianceNote?: string; rate?: number; gstRatePercent?: number; sortOrder: number;
      }>;
    },
    actor: ChainActor,
  ) {
    await connectDB();

    const canteen = await Canteen.findById(data.canteenId).lean<ICanteen>();
    if (!canteen) throw new AppError('OPS_034', 422, 'Canteen not found.');
    if (!canteen.isActive) throw new AppError('OPS_034', 422, 'Canteen is inactive.');

    const manufacturer = await Manufacturer.findById(data.manufacturerId).lean<IManufacturer>();
    if (!manufacturer) throw new AppError('OPS_035', 422, 'Manufacturer not found.');
    if (!manufacturer.isActive) throw new AppError('OPS_035', 422, 'Manufacturer is inactive.');

    if (data.originCanteenId) {
      const origin = await Canteen.findById(data.originCanteenId).lean<ICanteen>();
      if (!origin) throw new AppError('OPS_034', 422, 'Origin canteen not found.');
    }

    // Addresses must belong to the canteen they are being used for, otherwise a
    // shipment could be addressed to an unrelated party.
    await this.assertAddressBelongs(data.shipToAddressId, data.canteenId, ['shipTo', 'both']);
    await this.assertAddressBelongs(data.billToAddressId, data.canteenId, ['billTo', 'both']);

    if (data.assignedTo) await this.assertAssignable(data.assignedTo);

    // Guard against a double-import of the same PO for the same canteen.
    if (data.sourcePoNumber) {
      const dupe = await Chain.findOne({
        canteenId: new mongoose.Types.ObjectId(data.canteenId),
        sourcePoNumber: data.sourcePoNumber,
        status: { $nin: ['CANCELLED'] },
      }).select('_id chainNumber').lean<{ chainNumber: string }>();
      if (dupe) {
        throw new AppError(
          'OPS_062',
          409,
          `PO "${data.sourcePoNumber}" is already on chain ${dupe.chainNumber} for this canteen.`,
        );
      }
    }

    const actorOid = new mongoose.Types.ObjectId(actor.userId);
    const chainNumber = await generateChainNumber();

    const chain = await Chain.create({
      chainNumber,
      status: 'PO_RECEIVED' satisfies ChainStatus,
      canteenId: new mongoose.Types.ObjectId(data.canteenId),
      originCanteenId: data.originCanteenId ? new mongoose.Types.ObjectId(data.originCanteenId) : undefined,
      manufacturerId: new mongoose.Types.ObjectId(data.manufacturerId),
      shipToAddressId: data.shipToAddressId ? new mongoose.Types.ObjectId(data.shipToAddressId) : undefined,
      billToAddressId: data.billToAddressId ? new mongoose.Types.ObjectId(data.billToAddressId) : undefined,
      sourcePoNumber: data.sourcePoNumber,
      sourcePoDate: data.sourcePoDate,
      // Default ownership to the creator so a chain is never unowned.
      assignedTo: data.assignedTo ? new mongoose.Types.ObjectId(data.assignedTo) : actorOid,
      handoverHistory: [],
      dispatch: {},
      canteenPayment: { status: 'pending' },
      commission: {},
      isOnHold: false,
      createdBy: actorOid,
      updatedBy: actorOid,
    });

    if (data.lines && data.lines.length > 0) {
      await this.writeLines(String(chain._id), data.lines, actorOid);
      await this.recalcChainValues(String(chain._id));
    }

    await ChainEvent.create({
      chainId: chain._id,
      eventType: 'STATUS_CHANGE',
      toStatus: 'PO_RECEIVED',
      message: `Chain ${chainNumber} created`,
      actorUserId: actorOid,
    });

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.chain.create',
      targetType: 'Chain',
      targetId: String(chain._id),
    });

    return chain.toObject();
  }

  private static async assertAddressBelongs(
    addressId: string | undefined,
    canteenId: string,
    allowedTypes: string[],
  ): Promise<void> {
    if (!addressId) return;
    const addr = await OpsAddress.findById(addressId).lean<IOpsAddress>();
    if (!addr) throw new AppError('OPS_036', 422, 'Address not found.');
    if (!addr.isActive) throw new AppError('OPS_036', 422, 'Address is inactive.');
    if (!allowedTypes.includes(addr.addressType)) {
      throw new AppError(
        'OPS_036',
        422,
        `Address type "${addr.addressType}" cannot be used here (expected ${allowedTypes.join(' or ')}).`,
      );
    }
    // Company-owned addresses are usable anywhere; canteen-owned must match.
    if (addr.ownerType === 'canteen' && String(addr.ownerId) !== canteenId) {
      throw new AppError('OPS_036', 422, 'Address does not belong to this canteen.');
    }
  }

  private static async assertAssignable(userId: string): Promise<void> {
    if (!MONGO_ID_RE.test(userId)) throw new AppError('OPS_040', 422, 'Invalid assignee ID.');
    const user = await User.findById(userId).select('role isActive').lean<{ role: UserRole; isActive?: boolean }>();
    if (!user) throw new AppError('OPS_040', 422, 'Assignee not found.');
    if (user.isActive === false) throw new AppError('OPS_040', 422, 'Assignee is deactivated.');
    // employee is an attendance-only role and must never hold a work desk chain.
    if (user.role === 'employee') {
      throw new AppError('OPS_040', 422, 'Employees cannot be assigned Work Desk chains.');
    }
  }

  // ─── Update header ──────────────────────────────────────────────────

  static async update(
    chainId: string,
    data: {
      shipToAddressId?: string; billToAddressId?: string;
      sourcePoNumber?: string; sourcePoDate?: Date; originCanteenId?: string;
    },
    actor: ChainActor,
  ) {
    const chain = await this.loadForActor(chainId, actor);
    this.assertMutable(chain);

    await this.assertAddressBelongs(data.shipToAddressId, String(chain.canteenId), ['shipTo', 'both']);
    await this.assertAddressBelongs(data.billToAddressId, String(chain.canteenId), ['billTo', 'both']);

    const actorOid = new mongoose.Types.ObjectId(actor.userId);
    const before = chain.toObject();

    if (data.shipToAddressId !== undefined) {
      chain.shipToAddressId = new mongoose.Types.ObjectId(data.shipToAddressId);
    }
    if (data.billToAddressId !== undefined) {
      chain.billToAddressId = new mongoose.Types.ObjectId(data.billToAddressId);
    }
    if (data.originCanteenId !== undefined) {
      chain.originCanteenId = new mongoose.Types.ObjectId(data.originCanteenId);
    }
    if (data.sourcePoNumber !== undefined) chain.sourcePoNumber = data.sourcePoNumber;
    if (data.sourcePoDate !== undefined) chain.sourcePoDate = data.sourcePoDate;
    chain.updatedBy = actorOid;

    await chain.save();

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.chain.update',
      targetType: 'Chain',
      targetId: chainId,
      changes: { before, after: chain.toObject() },
    });

    return chain.toObject();
  }

  // ─── Line items ────────────────────────────────────────────────────

  /**
   * Replaces the whole line set. Resolution of every product reference happens
   * before any write, mirroring the ImportEngine two-phase approach — Atlas M0
   * has no multi-document transactions.
   */
  static async replaceLines(
    chainId: string,
    lines: Array<{
      productId?: string; rawDescription?: string; uom: string; packSize?: number;
      originalQty: number; alteredQty: number; varianceReason?: string;
      varianceNote?: string; rate?: number; gstRatePercent?: number; sortOrder: number;
    }>,
    actor: ChainActor,
  ) {
    const chain = await this.loadForActor(chainId, actor);
    this.assertMutable(chain);

    if (!this.linesEditable(chain.status as ChainStatus)) {
      throw new AppError(
        'OPS_061',
        409,
        `Line items cannot be edited once the chain reaches ${chain.status}.`,
      );
    }
    if (lines.length === 0) throw new AppError('OPS_037', 422, 'At least one line item is required.');

    // Reject duplicate products up front — two lines for one SKU makes the
    // altered order ambiguous for the manufacturer.
    const seen = new Set<string>();
    for (const l of lines) {
      if (!l.productId) continue;
      if (seen.has(l.productId)) {
        throw new AppError('OPS_038', 409, 'The same product appears on more than one line.');
      }
      seen.add(l.productId);
    }

    // Phase 1: resolve every product before writing anything.
    const { Product } = await import('@models/ops/Product');
    const productIds = [...seen].map((id) => new mongoose.Types.ObjectId(id));
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select('_id uom packSize gstRatePercent isActive').lean<Array<{
          _id: mongoose.Types.ObjectId; uom: string; packSize?: number;
          gstRatePercent?: number; isActive: boolean;
        }>>()
      : [];
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const missing = [...seen].filter((id) => !productMap.has(id));
    if (missing.length > 0) {
      throw new AppError('OPS_039', 422, `${missing.length} line(s) reference a product that no longer exists.`);
    }

    const actorOid = new mongoose.Types.ObjectId(actor.userId);

    // Phase 2: replace.
    await ChainLineItem.deleteMany({ chainId: chain._id });
    await this.writeLines(chainId, lines, actorOid, productMap);
    const totals = await this.recalcChainValues(chainId);

    await ChainEvent.create({
      chainId: chain._id,
      eventType: 'LINE_EDITED',
      message: `Line items updated (${lines.length} line${lines.length === 1 ? '' : 's'})`,
      metadata: { lineCount: lines.length, alteredOrderValue: totals.alteredOrderValue },
      actorUserId: actorOid,
    });

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.chain.lines.replace',
      targetType: 'Chain',
      targetId: chainId,
    });

    return { lineCount: lines.length, ...totals };
  }

  private static async writeLines(
    chainId: string,
    lines: Array<{
      productId?: string; rawDescription?: string; uom: string; packSize?: number;
      originalQty: number; alteredQty: number; varianceReason?: string;
      varianceNote?: string; rate?: number; gstRatePercent?: number; sortOrder: number;
    }>,
    actorOid: mongoose.Types.ObjectId,
    productMap?: Map<string, { uom: string; packSize?: number; gstRatePercent?: number }>,
  ): Promise<void> {
    void actorOid;
    const chainOid = new mongoose.Types.ObjectId(chainId);

    const docs = lines.map((l, idx) => {
      const product = l.productId ? productMap?.get(l.productId) : undefined;
      // Fall back to the product master for UOM and GST when the caller omits them.
      const gstRatePercent = l.gstRatePercent ?? product?.gstRatePercent;
      const totals = computeLineTotals({
        alteredQty: l.alteredQty,
        rate: l.rate,
        gstRatePercent,
      });
      return {
        chainId: chainOid,
        productId: l.productId ? new mongoose.Types.ObjectId(l.productId) : undefined,
        rawDescription: l.rawDescription,
        uom: l.uom || product?.uom || 'PCS',
        packSize: l.packSize ?? product?.packSize,
        originalQty: l.originalQty,
        alteredQty: l.alteredQty,
        varianceReason: l.varianceReason,
        varianceNote: l.varianceNote,
        rate: l.rate,
        gstRatePercent,
        taxableValue: totals.taxableValue,
        taxAmount: totals.taxAmount,
        lineTotal: totals.lineTotal,
        sortOrder: l.sortOrder ?? idx,
      };
    });

    await ChainLineItem.insertMany(docs);
  }

  /** Recomputes and persists the original/altered order values from the lines. */
  static async recalcChainValues(chainId: string): Promise<{
    originalOrderValue: number; alteredOrderValue: number;
  }> {
    await connectDB();
    const lines = await ChainLineItem.find({ chainId: new mongoose.Types.ObjectId(chainId) })
      .select('originalQty alteredQty rate gstRatePercent lineTotal')
      .lean<Array<{
        originalQty: number; alteredQty: number; rate?: number;
        gstRatePercent?: number; lineTotal?: number;
      }>>();

    let originalOrderValue = 0;
    let alteredOrderValue = 0;
    for (const l of lines) {
      const original = computeLineTotals({
        alteredQty: l.originalQty,
        rate: l.rate,
        gstRatePercent: l.gstRatePercent,
      });
      originalOrderValue = round2(originalOrderValue + original.lineTotal);
      alteredOrderValue = round2(alteredOrderValue + (l.lineTotal ?? 0));
    }

    await Chain.findByIdAndUpdate(chainId, { originalOrderValue, alteredOrderValue });
    return { originalOrderValue, alteredOrderValue };
  }

  // ─── Status ───────────────────────────────────────────────────────

  /**
   * Guarded status change. Rejects an illegal transition with OPS_032 and
   * reports the legal set, so the UI never has to guess.
   */
  static async changeStatus(
    chainId: string,
    toStatus: ChainStatus,
    actor: ChainActor,
    message?: string,
  ) {
    const chain = await this.loadForActor(chainId, actor);
    const fromStatus = chain.status as ChainStatus;

    if (fromStatus === toStatus) {
      throw new AppError('OPS_032', 409, `Chain is already ${toStatus}.`);
    }
    if (!canTransition(fromStatus, toStatus)) {
      const allowed = getAllowedTransitions(fromStatus);
      throw new AppError(
        'OPS_032',
        409,
        allowed.length === 0
          ? `${fromStatus} is a terminal status; no further transitions are allowed.`
          : `Cannot move from ${fromStatus} to ${toStatus}. Allowed: ${allowed.join(', ')}.`,
      );
    }

    // Business preconditions that the state graph alone cannot express.
    await this.assertTransitionPreconditions(chain, toStatus);

    const actorOid = new mongoose.Types.ObjectId(actor.userId);
    chain.status = toStatus;
    chain.updatedBy = actorOid;
    if (toStatus === 'ON_HOLD') chain.isOnHold = true;
    if (fromStatus === 'ON_HOLD' && toStatus !== 'ON_HOLD') chain.isOnHold = false;
    if (toStatus === 'CANCELLED') chain.cancelledAt = new Date();
    await chain.save();

    await ChainEvent.create({
      chainId: chain._id,
      eventType: 'STATUS_CHANGE',
      fromStatus,
      toStatus,
      message,
      actorUserId: actorOid,
    });

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.chain.status',
      targetType: 'Chain',
      targetId: chainId,
      changes: { before: { status: fromStatus }, after: { status: toStatus } },
    });

    return {
      id: chainId,
      status: toStatus,
      allowedTransitions: getAllowedTransitions(toStatus),
    };
  }

  private static async assertTransitionPreconditions(
    chain: IChain,
    toStatus: ChainStatus,
  ): Promise<void> {
    const oid = chain._id as mongoose.Types.ObjectId;

    if (toStatus === 'ALTERED' || toStatus === 'PENDING_INTERNAL_APPROVAL') {
      const lineCount = await ChainLineItem.countDocuments({ chainId: oid });
      if (lineCount === 0) {
        throw new AppError('OPS_037', 422, 'Add at least one line item before altering the order.');
      }
    }

    if (toStatus === 'UPLOADED_ON_PORTAL' && !chain.taxInvoiceNumber) {
      throw new AppError('OPS_049', 409, 'Record the manufacturer tax invoice before uploading to the portal.');
    }

    if (toStatus === 'IN_TRANSIT' && !chain.soNumber) {
      throw new AppError('OPS_050', 422, 'Record the sales order number before marking the chain in transit.');
    }

    if (toStatus === 'PAYMENT_RECEIVED' && (chain.canteenPayment?.status ?? 'pending') !== 'paid') {
      throw new AppError('OPS_052', 422, 'Record a full payment before marking payment received.');
    }

    if (toStatus === 'COMMISSION_RECEIVED' && !chain.commission?.raisedAt) {
      throw new AppError('OPS_054', 409, 'Raise the commission invoice before recording receipt.');
    }
  }

  // ─── Assignment, hold, cancel, comment ───────────────────────────────────

  static async assign(chainId: string, toUserId: string, actor: ChainActor, reason?: string) {
    const chain = await this.loadForActor(chainId, actor);
    this.assertMutable(chain);
    await this.assertAssignable(toUserId);

    if (String(chain.assignedTo ?? '') === toUserId) {
      throw new AppError('OPS_040', 409, 'Chain is already assigned to that user.');
    }

    const { assignChain } = await import('@services/ops/AssignmentService');
    await assignChain(chainId, toUserId, actor.userId, reason);

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(actor.userId),
      action: 'ops.chain.assign',
      targetType: 'Chain',
      targetId: chainId,
      changes: { before: { assignedTo: String(chain.assignedTo ?? '') }, after: { assignedTo: toUserId } },
    });

    return { id: chainId, assignedTo: toUserId };
  }

  static async setHold(chainId: string, hold: boolean, actor: ChainActor, reason?: string) {
    const chain = await this.loadForActor(chainId, actor);
    this.assertMutable(chain);

    if (hold === chain.isOnHold) {
      throw new AppError('OPS_060', 409, hold ? 'Chain is already on hold.' : 'Chain is not on hold.');
    }

    const actorOid = new mongoose.Types.ObjectId(actor.userId);

    if (hold) {
      const fromStatus = chain.status as ChainStatus;
      if (!canTransition(fromStatus, 'ON_HOLD')) {
        throw new AppError('OPS_060', 409, `A chain in ${fromStatus} cannot be put on hold.`);
      }
      chain.preHoldStatus = fromStatus;
      chain.status = 'ON_HOLD';
      chain.isOnHold = true;
      chain.holdReason = reason;
      await chain.save();
      await ChainEvent.create({
        chainId: chain._id, eventType: 'HOLD', fromStatus, toStatus: 'ON_HOLD',
        message: reason, actorUserId: actorOid,
      });
    } else {
      // Releasing a hold restores whatever status the chain was in before it
      // was put on hold. Falls back to UNDER_REVIEW only for chains put on
      // hold before this field existed.
      const restoredStatus = (chain.preHoldStatus as ChainStatus) ?? 'UNDER_REVIEW';
      chain.status = restoredStatus;
      chain.isOnHold = false;
      chain.holdReason = undefined;
      chain.preHoldStatus = undefined;
      await chain.save();
      await ChainEvent.create({
        chainId: chain._id, eventType: 'HOLD', fromStatus: 'ON_HOLD', toStatus: restoredStatus,
        message: reason ?? 'Hold released', actorUserId: actorOid,
      });
    }

    await AuditLog.create({
      performedBy: actorOid,
      action: hold ? 'ops.chain.hold' : 'ops.chain.unhold',
      targetType: 'Chain',
      targetId: chainId,
    });

    return { id: chainId, status: chain.status, isOnHold: chain.isOnHold };
  }

  static async cancel(chainId: string, reason: string, actor: ChainActor) {
    const chain = await this.loadForActor(chainId, actor);
    const fromStatus = chain.status as ChainStatus;

    if (!canTransition(fromStatus, 'CANCELLED')) {
      throw new AppError('OPS_032', 409, `A chain in ${fromStatus} can no longer be cancelled.`);
    }

    const actorOid = new mongoose.Types.ObjectId(actor.userId);
    chain.status = 'CANCELLED';
    chain.cancelledAt = new Date();
    chain.cancelReason = reason;
    chain.updatedBy = actorOid;
    await chain.save();

    await ChainEvent.create({
      chainId: chain._id, eventType: 'CANCEL', fromStatus, toStatus: 'CANCELLED',
      message: reason, actorUserId: actorOid,
    });
    await AuditLog.create({
      performedBy: actorOid, action: 'ops.chain.cancel',
      targetType: 'Chain', targetId: chainId,
    });

    return { id: chainId, status: 'CANCELLED' as ChainStatus };
  }

  static async addComment(chainId: string, message: string, actor: ChainActor) {
    const chain = await this.loadForActor(chainId, actor);
    const event = await ChainEvent.create({
      chainId: chain._id,
      eventType: 'COMMENT',
      message,
      actorUserId: new mongoose.Types.ObjectId(actor.userId),
    });
    return event.toObject();
  }
}
