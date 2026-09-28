import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { PriceList, type IPriceList } from '@models/ops/PriceList';
import { Manufacturer } from '@models/ops/Manufacturer';
import { Canteen } from '@models/ops/Canteen';
import { Product } from '@models/ops/Product';
import { withDuplicateGuard } from '@lib/utils/ops-guards';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';
import { escapeRegExp } from '@lib/utils/regex';

/**
 * Every id on a price list must point at something real. Without this the single-record
 * API happily stores a list for a manufacturer or product that does not exist, which
 * then never resolves and cannot be found from any screen.
 */
export async function assertPriceListRefs(
  manufacturerId: string,
  canteenId: string | undefined,
  productIds: string[],
  opts: { checkParents?: boolean } = { checkParents: true },
): Promise<void> {
  if (opts.checkParents !== false) {
    const mfr = await Manufacturer.findById(manufacturerId).select('isActive').lean<{ isActive: boolean }>();
    if (!mfr) throw new AppError('OPS_064', 422, 'Manufacturer not found.');
    if (!mfr.isActive) throw new AppError('OPS_064', 422, 'Manufacturer is inactive.');
    if (canteenId) {
      const canteen = await Canteen.findById(canteenId).select('isActive').lean<{ isActive: boolean }>();
      if (!canteen) throw new AppError('OPS_064', 422, 'Canteen not found.');
      if (!canteen.isActive) throw new AppError('OPS_064', 422, 'Canteen is inactive.');
    }
  }

  const unique = [...new Set(productIds)];
  if (unique.length === 0) return;
  const products = await Product.find({ _id: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select('manufacturerId sku')
    .lean<Array<{ manufacturerId: mongoose.Types.ObjectId; sku: string }>>();
  if (products.length !== unique.length) {
    throw new AppError('OPS_064', 422, `${unique.length - products.length} product(s) on this price list do not exist.`);
  }
  const foreign = products.filter((p) => String(p.manufacturerId) !== manufacturerId);
  if (foreign.length > 0) {
    throw new AppError(
      'OPS_064',
      422,
      `Product(s) ${foreign.slice(0, 5).map((p) => p.sku).join(', ')} belong to a different manufacturer than this price list.`,
    );
  }
}

/** OPS_022: active price list with overlapping window exists for the same scope key */
export async function assertNoOverlap(
  manufacturerId: mongoose.Types.ObjectId,
  canteenId: mongoose.Types.ObjectId | undefined,
  effectiveFrom: Date,
  effectiveTo: Date | undefined,
  excludeId?: mongoose.Types.ObjectId,
) {
  const scopeFilter: Record<string, unknown> = { manufacturerId };
  if (canteenId) scopeFilter.canteenId = canteenId;
  else scopeFilter.canteenId = { $exists: false };

  // Interval [A, B] overlaps [C, D] when A <= D and B >= C (open-ended treated as +∞)
  const overlapFilter: Record<string, unknown>[] = [
    { effectiveFrom: { $lte: effectiveTo ?? new Date('9999-12-31') }, $or: [{ effectiveTo: null }, { effectiveTo: { $gte: effectiveFrom } }] },
  ];

  const q: Record<string, unknown> = { ...scopeFilter, isActive: true, $and: overlapFilter };
  if (excludeId) q._id = { $ne: excludeId };

  const conflict = await PriceList.findOne(q).lean();
  if (conflict) {
    throw new AppError('OPS_022', 409, 'An active price list with an overlapping effective date window already exists for this scope.');
  }
}

export class PriceListService {
  static async list(params: {
    page: number; limit: number; search?: string;
    manufacturerId?: string; canteenId?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.search) {
      const re = new RegExp(escapeRegExp(params.search), 'i');
      const [mfrIds, canteenIds] = await Promise.all([
        Manufacturer.find({ $or: [{ code: re }, { name: re }] }).select('_id').lean(),
        Canteen.find({ $or: [{ code: re }, { name: re }] }).select('_id').lean(),
      ]);
      filter.$or = [
        { manufacturerId: { $in: mfrIds.map((m) => m._id) } },
        { canteenId: { $in: canteenIds.map((c) => c._id) } },
      ];
    }
    if (params.manufacturerId) filter.manufacturerId = new mongoose.Types.ObjectId(params.manufacturerId);
    if (params.canteenId) filter.canteenId = new mongoose.Types.ObjectId(params.canteenId);
    if (params.isActive !== undefined) filter.isActive = params.isActive;
    const sort: Record<string, 1 | -1> = { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 };
    const skip = calcSkip({ page: params.page, limit: params.limit });
    const [data, total] = await Promise.all([
      PriceList.find(filter).sort(sort).skip(skip).limit(params.limit)
        .populate('manufacturerId', 'code name')
        .populate('canteenId', 'code name')
        .lean<IPriceList[]>(),
      PriceList.countDocuments(filter),
    ]);
    return { data, pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) } };
  }

  static async getById(id: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid price list ID.');
    const pl = await PriceList.findById(id)
      .populate('manufacturerId', 'code name')
      .populate('canteenId', 'code name')
      .populate('items.productId', 'sku name uom')
      .lean<IPriceList>();
    if (!pl) throw new AppError('OPS_016', 404, 'Price list not found.');
    return pl;
  }

  static async create(data: {
    manufacturerId: string; canteenId?: string; effectiveFrom: string; effectiveTo?: string;
    items: { productId: string; rate: number }[];
  }, actorId: string) {
    await connectDB();
    const mOid = new mongoose.Types.ObjectId(data.manufacturerId);
    const cOid = data.canteenId ? new mongoose.Types.ObjectId(data.canteenId) : undefined;
    const from = new Date(data.effectiveFrom);
    const to   = data.effectiveTo ? new Date(data.effectiveTo) : undefined;

    await assertPriceListRefs(data.manufacturerId, data.canteenId, data.items.map((i) => i.productId));
    await assertNoOverlap(mOid, cOid, from, to);

    const actorOid = new mongoose.Types.ObjectId(actorId);
    // The unique (manufacturer, canteen, effectiveFrom) index also fires for an *inactive* list
    // with the same start date, which the overlap check ignores — surface it as a conflict.
    const pl = await withDuplicateGuard(
      () => PriceList.create({
        manufacturerId: mOid,
        canteenId: cOid,
        effectiveFrom: from,
        effectiveTo: to,
        items: data.items.map((i) => ({ productId: new mongoose.Types.ObjectId(i.productId), rate: i.rate, currency: 'INR' })),
        createdBy: actorOid,
        updatedBy: actorOid,
      }),
      'OPS_022',
      'A price list for this manufacturer, canteen and start date already exists (it may be inactive).',
    );
    await AuditLog.create({ performedBy: actorOid, action: 'ops.price-list.create', targetType: 'PriceList', targetId: String(pl._id) });
    return pl.toObject();
  }

  static async update(id: string, data: { effectiveFrom?: string; effectiveTo?: string; items?: { productId: string; rate: number }[] }, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid price list ID.');
    const pl = await PriceList.findById(id);
    if (!pl) throw new AppError('OPS_016', 404, 'Price list not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const before = pl.toObject();

    const newFrom = data.effectiveFrom ? new Date(data.effectiveFrom) : pl.effectiveFrom;
    const newTo   = data.effectiveTo !== undefined ? (data.effectiveTo ? new Date(data.effectiveTo) : undefined) : pl.effectiveTo;
    if (newTo && newTo.getTime() < newFrom.getTime()) {
      throw new AppError('OPS_025', 422, 'effectiveTo cannot be before effectiveFrom.');
    }
    if (data.items) {
      await assertPriceListRefs(String(pl.manufacturerId), undefined, data.items.map((i) => i.productId), { checkParents: false });
    }
    await assertNoOverlap(pl.manufacturerId, pl.canteenId ?? undefined, newFrom, newTo, pl._id as mongoose.Types.ObjectId);

    if (data.effectiveFrom) pl.effectiveFrom = newFrom;
    if (data.effectiveTo !== undefined) pl.effectiveTo = newTo;
    if (data.items) {
      pl.items = data.items.map((i) => ({ productId: new mongoose.Types.ObjectId(i.productId), rate: i.rate, currency: 'INR' as const }));
    }
    pl.updatedBy = actorOid;
    await withDuplicateGuard(
      () => pl.save(),
      'OPS_022',
      'Another price list already starts on that date for this manufacturer and canteen.',
    );
    await AuditLog.create({ performedBy: actorOid, action: 'ops.price-list.update', targetType: 'PriceList', targetId: id, changes: { before, after: pl.toObject() } });
    return pl.toObject();
  }

  static async setStatus(id: string, isActive: boolean, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid price list ID.');
    const pl = await PriceList.findById(id).lean();
    if (!pl) throw new AppError('OPS_016', 404, 'Price list not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    await PriceList.findByIdAndUpdate(id, { isActive, updatedBy: actorOid });
    await AuditLog.create({ performedBy: actorOid, action: isActive ? 'ops.price-list.activate' : 'ops.price-list.deactivate', targetType: 'PriceList', targetId: id });
  }

  /**
   * resolveRate: find best-matching active price list for a product on a given date.
   * Specificity: canteen-specific for manufacturer > manufacturer-wide.
   * Returns null if nothing matches; never throws.
   */
  static async resolveRate(productId: string, manufacturerId: string, canteenId: string, onDate: Date): Promise<number | null> {
    await connectDB();
    const pOid = new mongoose.Types.ObjectId(productId);
    const mOid = new mongoose.Types.ObjectId(manufacturerId);
    const cOid = new mongoose.Types.ObjectId(canteenId);
    const dateFilter = { effectiveFrom: { $lte: onDate }, $or: [{ effectiveTo: null }, { effectiveTo: { $gte: onDate } }] };

    const canteenList = await PriceList.findOne({
      manufacturerId: mOid, canteenId: cOid, isActive: true, 'items.productId': pOid, ...dateFilter,
    }).lean<IPriceList>();
    if (canteenList) {
      const item = canteenList.items.find((i) => String(i.productId) === productId);
      return item?.rate ?? null;
    }

    const mfrList = await PriceList.findOne({
      manufacturerId: mOid, canteenId: { $exists: false }, isActive: true, 'items.productId': pOid, ...dateFilter,
    }).lean<IPriceList>();
    if (mfrList) {
      const item = mfrList.items.find((i) => String(i.productId) === productId);
      return item?.rate ?? null;
    }

    return null;
  }
}
