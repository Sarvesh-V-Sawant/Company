/**
 * Commission computation, invoicing and receipt (Phase 30.08).
 *
 * This is the module that decides what the company earns, so it is deliberately
 * conservative:
 *   - It NEVER guesses a tax treatment. OpsSettingsService.assertCommissionTaxReady()
 *     gates every raise, so an invoice cannot be produced while GST/SAC is
 *     unconfigured (OPS_055).
 *   - It refuses to raise twice (OPS_054) and refuses without a rule (OPS_053).
 *   - Commission is raised against a COLLECTED payment, not a delivery, because
 *     the commission is earned once the canteen has paid.
 *   - The applied rule is snapshotted onto the chain, so later edits to a master
 *     rule cannot retroactively change a raised invoice.
 *
 * Status transitions are performed here with an explicit canTransition() check
 * rather than the plain-Error transitionChain(), so callers get coded errors.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { AuditLog } from '@models/AuditLog';
import { Chain } from '@models/ops/Chain';
import { ChainLineItem } from '@models/ops/ChainLineItem';
import { ChainEvent } from '@models/ops/ChainEvent';
import { CommissionRule, type ICommissionRule } from '@models/ops/CommissionRule';
import { Counter } from '@models/ops/Counter';
import { OpsSettingsService } from '@services/ops/OpsSettingsService';
import { round2, ChainService } from '@services/ops/ChainService';
import { canTransition, type ChainStatus } from '@services/ops/ChainStatusMachine';

export interface CommissionRuleSnapshot {
  ruleId: string;
  scope: 'manufacturer' | 'product' | 'canteen';
  type: 'percentage' | 'perUnit' | 'flat';
  value: number;
  effectiveFrom: Date;
  sacCode?: string;
}

export interface CommissionBreakdown {
  chainId: string;
  chainNumber: string;
  /** Value the commission is computed on. */
  basisAmount: number;
  basisLabel: string;
  totalUnits: number;
  rule: CommissionRuleSnapshot | null;
  commissionAmount: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  gstAmount: number;
  totalInvoiceValue: number;
  sacCode?: string;
  /** Already-raised details, when applicable. */
  alreadyRaised: boolean;
  invoiceNumber?: string;
  raisedAt?: Date;
  receivedAt?: Date;
  receivedAmount?: number;
  /** Set when the chain is not yet in a state where a raise is allowed. */
  blockedReason?: string;
}

/** Indian fiscal year label, e.g. "25-26". April-start, evaluated in IST. */
function fiscalYearLabel(date: Date): string {
  // Shift to IST without a dependency: IST is UTC+5:30 with no DST.
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth(); // 0 = January
  const startYear = month >= 3 ? year : year - 1;
  const two = (n: number): string => String(n % 100).padStart(2, '0');
  return `${two(startYear)}-${two(startYear + 1)}`;
}

export class CommissionService {
  /**
   * Picks the applicable rule. Precedence is most-specific-first: canteen, then
   * manufacturer. Product-scoped rules are not auto-applied at chain level,
   * because a chain spans many products; that stays an explicit override.
   */
  static async resolveRule(
    manufacturerId: mongoose.Types.ObjectId | string | undefined,
    canteenId: mongoose.Types.ObjectId | string | undefined,
    on: Date = new Date(),
  ): Promise<ICommissionRule | null> {
    await connectDB();

    const dateWindow = {
      effectiveFrom: { $lte: on },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: on } }],
    };

    if (canteenId) {
      const canteenRule = await CommissionRule.findOne({
        scope: 'canteen',
        canteenId: new mongoose.Types.ObjectId(String(canteenId)),
        isActive: true,
        ...dateWindow,
      }).sort({ effectiveFrom: -1 });
      if (canteenRule) return canteenRule;
    }

    if (manufacturerId) {
      const mfrRule = await CommissionRule.findOne({
        scope: 'manufacturer',
        manufacturerId: new mongoose.Types.ObjectId(String(manufacturerId)),
        isActive: true,
        ...dateWindow,
      }).sort({ effectiveFrom: -1 });
      if (mfrRule) return mfrRule;
    }

    return null;
  }

  /**
   * Computes the commission WITHOUT writing anything. Safe to call for preview.
   * When the commission is already raised, the stored snapshot is returned so
   * the preview matches the invoice on record.
   */
  static async compute(chainId: string, overrideAmount?: number): Promise<CommissionBreakdown> {
    await connectDB();

    if (!/^[0-9a-f]{24}$/i.test(chainId)) {
      throw new AppError('OPS_030', 400, 'Invalid chain ID.');
    }

    const chain = await Chain.findById(chainId);
    if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

    const lines = await ChainLineItem.find({ chainId: new mongoose.Types.ObjectId(chainId) })
      .select('alteredQty deliveredQty')
      .lean();

    // Units billed = what was actually delivered where known, else the final
    // agreed quantity. Per-unit commission must not pay on undelivered goods.
    const totalUnits = lines.reduce((sum, l) => {
      const delivered = l.deliveredQty;
      const qty =
        typeof delivered === 'number' && Number.isFinite(delivered)
          ? delivered
          : Number(l.alteredQty ?? 0);
      return sum + qty;
    }, 0);

    const basisAmount = round2(Number(chain.alteredOrderValue ?? 0));
    const existing = chain.commission;
    // A claim without an invoice number is an in-flight or abandoned raise, not a raised invoice.
    const alreadyRaised = Boolean(existing?.raisedAt && existing?.invoiceNumber);

    const tax = await OpsSettingsService.get();
    const gstApplicable = tax.commissionTax.gstApplicable;
    const gstRatePercent = gstApplicable ? Number(tax.commissionTax.gstRatePercent ?? 0) : 0;

    // Already raised: report the recorded figures, not a recomputation.
    if (alreadyRaised) {
      const snapshot = (existing?.ruleSnapshot ?? null) as unknown as CommissionRuleSnapshot | null;
      const commissionAmount = round2(Number(existing?.computedAmount ?? 0));
      const gstAmount = round2((commissionAmount * gstRatePercent) / 100);
      return {
        chainId,
        chainNumber: chain.chainNumber,
        basisAmount,
        basisLabel: 'Altered order value',
        totalUnits,
        rule: snapshot,
        commissionAmount,
        gstApplicable,
        gstRatePercent,
        gstAmount,
        totalInvoiceValue: round2(commissionAmount + gstAmount),
        sacCode: tax.commissionTax.sacCode,
        alreadyRaised: true,
        invoiceNumber: existing?.invoiceNumber,
        raisedAt: existing?.raisedAt,
        receivedAt: existing?.receivedAt,
        receivedAmount: existing?.receivedAmount,
      };
    }

    const rule = await this.resolveRule(chain.manufacturerId, chain.canteenId);

    let commissionAmount = 0;
    if (typeof overrideAmount === 'number' && Number.isFinite(overrideAmount)) {
      commissionAmount = round2(overrideAmount);
    } else if (rule) {
      if (rule.type === 'percentage') {
        commissionAmount = round2((basisAmount * Number(rule.value)) / 100);
      } else if (rule.type === 'perUnit') {
        commissionAmount = round2(totalUnits * Number(rule.value));
      } else {
        commissionAmount = round2(Number(rule.value));
      }
    }

    const gstAmount = round2((commissionAmount * gstRatePercent) / 100);

    const status = chain.status as ChainStatus;
    let blockedReason: string | undefined;
    if (status !== 'PAYMENT_RECEIVED') {
      blockedReason = `Commission can only be raised once the canteen's payment is received. Current status: ${status}.`;
    } else if (!rule && overrideAmount === undefined) {
      blockedReason =
        'No active commission rule matches this manufacturer or canteen. Add a rule, or raise with an explicit override amount.';
    }

    return {
      chainId,
      chainNumber: chain.chainNumber,
      basisAmount,
      basisLabel: 'Altered order value',
      totalUnits,
      rule: rule
        ? {
            ruleId: String(rule._id),
            scope: rule.scope,
            type: rule.type,
            value: Number(rule.value),
            effectiveFrom: rule.effectiveFrom,
            sacCode: rule.sacCode,
          }
        : null,
      commissionAmount,
      gstApplicable,
      gstRatePercent,
      gstAmount,
      totalInvoiceValue: round2(commissionAmount + gstAmount),
      sacCode: tax.commissionTax.sacCode,
      alreadyRaised: false,
      blockedReason,
    };
  }

  /**
   * Reserves the next commission invoice number for the current fiscal year.
   * Uses the same atomic counter pattern as chain numbering.
   */
  static async nextInvoiceNumber(prefix: string, on: Date = new Date()): Promise<string> {
    await connectDB();
    const fy = fiscalYearLabel(on);
    const counter = await Counter.findOneAndUpdate(
      { key: `commission:${fy}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    const seq = String(counter?.seq ?? 1).padStart(5, '0');
    return `${prefix}/${fy}/${seq}`;
  }

  /**
   * Raises the commission invoice and advances the chain to COMMISSION_RAISED.
   * Approval-grade: gated on role at the route, on payment here.
   */
  static async raise(
    chainId: string,
    actorId: string,
    overrideAmount?: number,
    note?: string,
  ) {
    await connectDB();

    // Tax treatment must be configured before an invoice number is burned.
    const tax = await OpsSettingsService.assertCommissionTaxReady();

    const chain = await Chain.findById(chainId);
    if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

    // A claim with no invoice number that is older than two minutes was left by a request that
    // died mid-way; it is not "raised" and is re-claimed by the atomic step below.
    const abandonedClaim =
      !chain.commission?.invoiceNumber &&
      !!chain.commission?.raisedAt &&
      Date.now() - new Date(chain.commission.raisedAt).getTime() > 2 * 60 * 1000;
    if (chain.commission?.raisedAt && !abandonedClaim) {
      throw new AppError(
        'OPS_054',
        409,
        `Commission was already raised for this chain as invoice ${chain.commission.invoiceNumber ?? '(number missing)'}.`,
      );
    }

    const status = chain.status as ChainStatus;
    if (status !== 'PAYMENT_RECEIVED') {
      throw new AppError(
        'OPS_052',
        409,
        `Commission can only be raised once the canteen's payment is received. Current status: ${status}.`,
      );
    }

    const breakdown = await this.compute(chainId, overrideAmount);

    if (!breakdown.rule && overrideAmount === undefined) {
      throw new AppError(
        'OPS_053',
        422,
        'No active commission rule matches this manufacturer or canteen. Add a rule, or raise with an explicit override amount.',
      );
    }

    if (!(breakdown.commissionAmount > 0)) {
      throw new AppError(
        'OPS_053',
        422,
        'The computed commission is zero. Check the rule or provide an override amount.',
      );
    }

    if (!canTransition(status, 'COMMISSION_RAISED')) {
      throw new AppError(
        'OPS_032',
        409,
        `This chain cannot move from ${status} to COMMISSION_RAISED.`,
      );
    }

    const actorOid = new mongoose.Types.ObjectId(actorId);
    const now = new Date();

    // Invoice numbers are statutory: two requests must never both draw one for the same chain.
    // Step 1 claims the chain atomically (raisedAt is the claim marker). Only the winner goes on
    // to take a number, so a loser consumes nothing. A claim older than two minutes with no
    // invoice number is treated as abandoned by a crashed request and may be re-claimed.
    const staleBefore = new Date(now.getTime() - 2 * 60 * 1000);
    const claimed = await Chain.findOneAndUpdate(
      {
        _id: chain._id,
        status: 'PAYMENT_RECEIVED',
        $or: [
          { 'commission.raisedAt': null },
          { 'commission.raisedAt': { $lt: staleBefore }, 'commission.invoiceNumber': null },
        ],
      },
      { $set: { 'commission.raisedAt': now, updatedBy: actorOid } },
      { new: false },
    ).select('_id');
    if (!claimed) {
      throw new AppError(
        'OPS_054',
        409,
        'Commission is already being raised, or was already raised, for this chain. Reload to see the invoice.',
      );
    }

    // Step 2: take the number as late as possible and finish in one conditional write. If it
    // fails, release the claim so the raise can be retried.
    let invoiceNumber: string;
    try {
      invoiceNumber = await this.nextInvoiceNumber(tax.invoiceNumberPrefix);
      const finished = await Chain.updateOne(
        { _id: chain._id, status: 'PAYMENT_RECEIVED', 'commission.raisedAt': now },
        {
          $set: {
            'commission.ruleSnapshot': breakdown.rule ?? { override: true },
            'commission.computedAmount': breakdown.commissionAmount,
            'commission.invoiceNumber': invoiceNumber,
            status: 'COMMISSION_RAISED',
            updatedBy: actorOid,
          },
        },
      );
      if (finished.matchedCount === 0) {
        throw new AppError('OPS_065', 409, 'This chain changed while the invoice was being raised. Reload and retry.');
      }
    } catch (err) {
      await Chain.updateOne(
        { _id: chain._id, 'commission.raisedAt': now, 'commission.invoiceNumber': null },
        { $unset: { 'commission.raisedAt': '' } },
      ).catch(() => undefined);
      throw err;
    }
    chain.status = 'COMMISSION_RAISED';

    await ChainEvent.create({
      chainId: chain._id,
      eventType: 'STATUS_CHANGE',
      fromStatus: status,
      toStatus: 'COMMISSION_RAISED',
      message: `Commission invoice ${invoiceNumber} raised for ${breakdown.commissionAmount}${note ? ` — ${note}` : ''}`,
      metadata: {
        invoiceNumber,
        commissionAmount: breakdown.commissionAmount,
        gstApplicable: breakdown.gstApplicable,
        gstRatePercent: breakdown.gstRatePercent,
        gstAmount: breakdown.gstAmount,
        totalInvoiceValue: breakdown.totalInvoiceValue,
        overridden: overrideAmount !== undefined,
      },
      actorUserId: actorOid,
    });

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.chain.commission.raise',
      targetType: 'Chain',
      targetId: chainId,
      changes: { after: { invoiceNumber, commissionAmount: breakdown.commissionAmount } },
    });

    return {
      chainId,
      chainNumber: chain.chainNumber,
      invoiceNumber,
      commissionAmount: breakdown.commissionAmount,
      gstApplicable: breakdown.gstApplicable,
      gstRatePercent: breakdown.gstRatePercent,
      gstAmount: breakdown.gstAmount,
      totalInvoiceValue: breakdown.totalInvoiceValue,
      sacCode: tax.sacCode,
      raisedAt: now,
      status: chain.status,
    };
  }

  /** Records receipt of the commission and advances to COMMISSION_RECEIVED. */
  static async recordReceipt(
    chainId: string,
    input: { receivedAmount: number; receivedAt: Date; referenceNo?: string },
    actorId: string,
  ) {
    await connectDB();

    const chain = await Chain.findById(chainId);
    if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

    if (!chain.commission?.raisedAt) {
      throw new AppError(
        'OPS_054',
        409,
        'Raise the commission invoice before recording its receipt.',
      );
    }

    const status = chain.status as ChainStatus;
    if (status !== 'COMMISSION_RAISED' && status !== 'COMMISSION_RECEIVED') {
      throw new AppError(
        'OPS_032',
        409,
        `A commission receipt can only be recorded against a raised invoice. Current status: ${status}.`,
      );
    }

    if (!Number.isFinite(input.receivedAmount) || input.receivedAmount <= 0) {
      throw new AppError('OPS_052', 422, 'Enter a received amount greater than zero.');
    }

    const actorOid = new mongoose.Types.ObjectId(actorId);
    const receivedAmount = round2(input.receivedAmount);

    chain.commission.receivedAmount = receivedAmount;
    chain.commission.receivedAt = input.receivedAt;
    chain.updatedBy = actorOid;

    const advancing = status === 'COMMISSION_RAISED';
    if (advancing) {
      if (!canTransition(status, 'COMMISSION_RECEIVED')) {
        throw new AppError(
          'OPS_032',
          409,
          `This chain cannot move from ${status} to COMMISSION_RECEIVED.`,
        );
      }
      chain.status = 'COMMISSION_RECEIVED';
    }
    // Conditional on the status we validated, so a concurrent receipt/close cannot be overwritten.
    await ChainService.casChain(
      chain._id as mongoose.Types.ObjectId,
      status,
      {
        'commission.receivedAmount': receivedAmount,
        'commission.receivedAt': input.receivedAt,
        updatedBy: actorOid,
        ...(advancing ? { status: 'COMMISSION_RECEIVED' } : {}),
      },
    );

    await ChainEvent.create({
      chainId: chain._id,
      eventType: advancing ? 'STATUS_CHANGE' : 'COMMENT',
      fromStatus: advancing ? status : undefined,
      toStatus: advancing ? 'COMMISSION_RECEIVED' : undefined,
      message: `Commission receipt of ${receivedAmount} recorded${input.referenceNo ? ` (ref ${input.referenceNo})` : ''}`,
      metadata: {
        invoiceNumber: chain.commission.invoiceNumber,
        receivedAmount,
        referenceNo: input.referenceNo,
        shortReceipt: receivedAmount < Number(chain.commission.computedAmount ?? 0),
      },
      actorUserId: actorOid,
    });

    await AuditLog.create({
      performedBy: actorOid,
      action: 'ops.chain.commission.receive',
      targetType: 'Chain',
      targetId: chainId,
      changes: { after: { receivedAmount, referenceNo: input.referenceNo } },
    });

    return {
      chainId,
      chainNumber: chain.chainNumber,
      invoiceNumber: chain.commission.invoiceNumber,
      computedAmount: chain.commission.computedAmount,
      receivedAmount,
      receivedAt: input.receivedAt,
      status: chain.status,
    };
  }
}
