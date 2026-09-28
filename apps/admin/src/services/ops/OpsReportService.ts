/**
 * Work Desk reporting (Phase 30.09).
 *
 * Five read-only reports driven by aggregation pipelines. Every one respects the
 * caller's chain scope, so an executive sees only chains assigned to them — a
 * report must never become a way around the row-level filter enforced elsewhere.
 *
 * Money is summed in the database rather than in JavaScript so the totals do not
 * depend on how many rows a page happens to fetch.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { Chain } from '@models/ops/Chain';
import { ChainLineItem } from '@models/ops/ChainLineItem';
import { chainScopeFilter } from '@lib/permissions/can';
import type { ChainActor } from '@services/ops/ChainService';
import { round2 } from '@services/ops/ChainService';

const TERMINAL = ['CLOSED', 'CANCELLED'];

export interface ReportRange {
  fromDate?: Date;
  toDate?: Date;
}

function rangeMatch(range: ReportRange): Record<string, unknown> {
  if (!range.fromDate && !range.toDate) return {};
  const createdAt: Record<string, Date> = {};
  if (range.fromDate) createdAt.$gte = range.fromDate;
  if (range.toDate) createdAt.$lte = range.toDate;
  return { createdAt };
}

export class OpsReportService {
  /** Base match combining the actor's scope with the requested date range. */
  private static baseMatch(actor: ChainActor, range: ReportRange): Record<string, unknown> {
    return {
      ...chainScopeFilter(actor.role, actor.userId),
      ...rangeMatch(range),
    };
  }

  /** Count and value of chains per status — the pipeline view. */
  static async pipeline(actor: ChainActor, range: ReportRange) {
    await connectDB();

    const rows = await Chain.aggregate<{
      _id: string;
      count: number;
      originalValue: number;
      alteredValue: number;
      onHold: number;
    }>([
      { $match: this.baseMatch(actor, range) },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          originalValue: { $sum: { $ifNull: ['$originalOrderValue', 0] } },
          alteredValue: { $sum: { $ifNull: ['$alteredOrderValue', 0] } },
          onHold: { $sum: { $cond: [{ $eq: ['$isOnHold', true] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const totals = rows.reduce(
      (acc, r) => {
        acc.count += r.count;
        acc.originalValue += r.originalValue;
        acc.alteredValue += r.alteredValue;
        acc.onHold += r.onHold;
        return acc;
      },
      { count: 0, originalValue: 0, alteredValue: 0, onHold: 0 },
    );

    return {
      byStatus: rows.map((r) => ({
        status: r._id,
        count: r.count,
        originalValue: round2(r.originalValue),
        alteredValue: round2(r.alteredValue),
        onHold: r.onHold,
      })),
      totals: {
        count: totals.count,
        originalValue: round2(totals.originalValue),
        alteredValue: round2(totals.alteredValue),
        onHold: totals.onHold,
        // Negative means the reworked order came out below the original PO.
        alterationDelta: round2(totals.alteredValue - totals.originalValue),
      },
    };
  }

  /** Commission raised vs received, with the outstanding balance. */
  static async commission(actor: ChainActor, range: ReportRange) {
    await connectDB();

    const rows = await Chain.aggregate<{
      _id: mongoose.Types.ObjectId | null;
      manufacturerName: string;
      raisedCount: number;
      raisedAmount: number;
      receivedCount: number;
      receivedAmount: number;
    }>([
      {
        $match: {
          ...this.baseMatch(actor, range),
          'commission.raisedAt': { $ne: null },
          'commission.invoiceNumber': { $ne: null },
        },
      },
      {
        $group: {
          _id: '$manufacturerId',
          raisedCount: { $sum: 1 },
          raisedAmount: { $sum: { $ifNull: ['$commission.computedAmount', 0] } },
          receivedCount: {
            $sum: { $cond: [{ $ifNull: ['$commission.receivedAt', false] }, 1, 0] },
          },
          receivedAmount: { $sum: { $ifNull: ['$commission.receivedAmount', 0] } },
        },
      },
      {
        $lookup: {
          from: 'manufacturers',
          localField: '_id',
          foreignField: '_id',
          as: 'mfr',
        },
      },
      {
        $addFields: {
          manufacturerName: { $ifNull: [{ $first: '$mfr.name' }, 'Unknown'] },
        },
      },
      { $project: { mfr: 0 } },
      { $sort: { raisedAmount: -1 } },
    ]);

    const byManufacturer = rows.map((r) => ({
      manufacturerId: r._id ? String(r._id) : null,
      manufacturerName: r.manufacturerName,
      raisedCount: r.raisedCount,
      raisedAmount: round2(r.raisedAmount),
      receivedCount: r.receivedCount,
      receivedAmount: round2(r.receivedAmount),
      outstanding: round2(r.raisedAmount - r.receivedAmount),
    }));

    return {
      byManufacturer,
      totals: {
        raisedAmount: round2(byManufacturer.reduce((s, r) => s + r.raisedAmount, 0)),
        receivedAmount: round2(byManufacturer.reduce((s, r) => s + r.receivedAmount, 0)),
        outstanding: round2(byManufacturer.reduce((s, r) => s + r.outstanding, 0)),
      },
    };
  }

  /** Volume and value per manufacturer. */
  static async byManufacturer(actor: ChainActor, range: ReportRange) {
    await connectDB();

    const rows = await Chain.aggregate<{
      _id: mongoose.Types.ObjectId;
      name: string;
      code: string;
      chains: number;
      alteredValue: number;
      delivered: number;
      cancelled: number;
    }>([
      { $match: this.baseMatch(actor, range) },
      {
        $group: {
          _id: '$manufacturerId',
          chains: { $sum: 1 },
          alteredValue: { $sum: { $ifNull: ['$alteredOrderValue', 0] } },
          delivered: {
            $sum: { $cond: [{ $ifNull: ['$deliveredAt', false] }, 1, 0] },
          },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'manufacturers', localField: '_id', foreignField: '_id', as: 'm' } },
      {
        $addFields: {
          name: { $ifNull: [{ $first: '$m.name' }, 'Unknown'] },
          code: { $ifNull: [{ $first: '$m.code' }, '\u2014'] },
        },
      },
      { $project: { m: 0 } },
      { $sort: { alteredValue: -1 } },
    ]);

    return rows.map((r) => ({
      manufacturerId: String(r._id),
      code: r.code,
      name: r.name,
      chains: r.chains,
      alteredValue: round2(r.alteredValue),
      delivered: r.delivered,
      cancelled: r.cancelled,
    }));
  }

  /** Volume, value and payment position per canteen. */
  static async byCanteen(actor: ChainActor, range: ReportRange) {
    await connectDB();

    const rows = await Chain.aggregate<{
      _id: mongoose.Types.ObjectId;
      name: string;
      code: string;
      chains: number;
      alteredValue: number;
      paidAmount: number;
      unpaidChains: number;
    }>([
      { $match: this.baseMatch(actor, range) },
      {
        $group: {
          _id: '$canteenId',
          chains: { $sum: 1 },
          alteredValue: { $sum: { $ifNull: ['$alteredOrderValue', 0] } },
          paidAmount: {
            $sum: {
              $cond: [
                { $eq: ['$canteenPayment.status', 'paid'] },
                { $ifNull: ['$canteenPayment.amount', 0] },
                0,
              ],
            },
          },
          unpaidChains: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $not: [{ $in: ['$status', TERMINAL] }] },
                    { $ne: ['$canteenPayment.status', 'paid'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $lookup: { from: 'canteens', localField: '_id', foreignField: '_id', as: 'c' } },
      {
        $addFields: {
          name: { $ifNull: [{ $first: '$c.name' }, 'Unknown'] },
          code: { $ifNull: [{ $first: '$c.code' }, '\u2014'] },
        },
      },
      { $project: { c: 0 } },
      { $sort: { alteredValue: -1 } },
    ]);

    return rows.map((r) => ({
      canteenId: String(r._id),
      code: r.code,
      name: r.name,
      chains: r.chains,
      alteredValue: round2(r.alteredValue),
      paidAmount: round2(r.paidAmount),
      unpaidChains: r.unpaidChains,
    }));
  }

  /**
   * Ageing of open chains, bucketed by days since creation. This is the report
   * that answers "what is stuck", which is the question the desk exists to answer.
   */
  static async ageing(actor: ChainActor) {
    await connectDB();

    const rows = await Chain.aggregate<{
      _id: string;
      count: number;
      chains: Array<{
        id: mongoose.Types.ObjectId;
        chainNumber: string;
        status: string;
        ageDays: number;
        isOnHold: boolean;
      }>;
    }>([
      {
        $match: {
          ...chainScopeFilter(actor.role, actor.userId),
          status: { $nin: TERMINAL },
        },
      },
      {
        $addFields: {
          ageDays: {
            $floor: {
              $divide: [{ $subtract: ['$$NOW', '$createdAt'] }, 1000 * 60 * 60 * 24],
            },
          },
        },
      },
      {
        $addFields: {
          bucket: {
            $switch: {
              branches: [
                { case: { $lte: ['$ageDays', 3] }, then: '0-3 days' },
                { case: { $lte: ['$ageDays', 7] }, then: '4-7 days' },
                { case: { $lte: ['$ageDays', 14] }, then: '8-14 days' },
                { case: { $lte: ['$ageDays', 30] }, then: '15-30 days' },
              ],
              default: '30+ days',
            },
          },
        },
      },
      {
        $group: {
          _id: '$bucket',
          count: { $sum: 1 },
          chains: {
            $push: {
              id: '$_id',
              chainNumber: '$chainNumber',
              status: '$status',
              ageDays: '$ageDays',
              isOnHold: '$isOnHold',
            },
          },
        },
      },
    ]);

    // Fixed display order, including empty buckets, so the chart never reorders.
    const ORDER = ['0-3 days', '4-7 days', '8-14 days', '15-30 days', '30+ days'];
    const byBucket = ORDER.map((bucket) => {
      const found = rows.find((r) => r._id === bucket);
      return {
        bucket,
        count: found?.count ?? 0,
        // Cap the drill-down list; the full list belongs on the chains page.
        chains: (found?.chains ?? [])
          .sort((a, b) => b.ageDays - a.ageDays)
          .slice(0, 10)
          .map((c) => ({
            id: String(c.id),
            chainNumber: c.chainNumber,
            status: c.status,
            ageDays: c.ageDays,
            isOnHold: c.isOnHold,
          })),
      };
    });

    return {
      byBucket,
      totalOpen: byBucket.reduce((s, b) => s + b.count, 0),
    };
  }

  /** Short-supply exposure: lines where less was delivered than agreed. */
  static async shortSupply(actor: ChainActor, range: ReportRange) {
    await connectDB();

    const scopedChains = await Chain.find(this.baseMatch(actor, range))
      .select('_id chainNumber status')
      .lean<Array<{ _id: mongoose.Types.ObjectId; chainNumber: string; status: string }>>();

    if (scopedChains.length === 0) return { rows: [], totals: { lines: 0, shortValue: 0 } };

    const chainMap = new Map(scopedChains.map((c) => [String(c._id), c]));

    const lines = await ChainLineItem.find({
      chainId: { $in: scopedChains.map((c) => c._id) },
      shortSuppliedQty: { $gt: 0 },
    })
      .populate('productId', 'sku name')
      .lean();

    const rows = lines.map((raw) => {
      const l = raw as unknown as {
        chainId: mongoose.Types.ObjectId;
        productId?: { sku?: string; name?: string };
        rawDescription?: string;
        uom: string;
        alteredQty: number;
        deliveredQty?: number;
        shortSuppliedQty?: number;
        rate?: number;
      };
      const chain = chainMap.get(String(l.chainId));
      const shortQty = l.shortSuppliedQty ?? 0;
      return {
        chainId: String(l.chainId),
        chainNumber: chain?.chainNumber ?? '\u2014',
        status: chain?.status ?? '\u2014',
        item: l.productId?.name
          ? `${l.productId.sku ?? ''} ${l.productId.name}`.trim()
          : (l.rawDescription ?? 'Unspecified item'),
        uom: l.uom,
        agreedQty: l.alteredQty,
        deliveredQty: l.deliveredQty ?? 0,
        shortQty,
        shortValue: round2(shortQty * (l.rate ?? 0)),
      };
    });

    return {
      rows: rows.sort((a, b) => b.shortValue - a.shortValue),
      totals: {
        lines: rows.length,
        shortValue: round2(rows.reduce((s, r) => s + r.shortValue, 0)),
      },
    };
  }
}
