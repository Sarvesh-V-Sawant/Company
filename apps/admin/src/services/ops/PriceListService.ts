import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { PriceList, type IPriceList } from '@models/ops/PriceList';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';

/** OPS_022: active price list with overlapping window exists for the same scope key */
async function assertNoOverlap(
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

    await assertNoOverlap(mOid, cOid, from, to);

    const actorOid = new mongoose.Types.ObjectId(actorId);
    const pl = await PriceList.create({
      manufacturerId: mOid,
      canteenId: cOid,
      effectiveFrom: from,
      effectiveTo: to,
      items: data.items.map((i) => ({ productId: new mongoose.Types.ObjectId(i.productId), rate: i.rate, currency: 'INR' })),
      createdBy: actorOid,
      updatedBy: actorOid,
    });
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
    await assertNoOverlap(pl.manufacturerId, pl.canteenId ?? undefined, newFrom, newTo, pl._id as mongoose.Types.ObjectId);

    if (data.effectiveFrom) pl.effectiveFrom = newFrom;
    if (data.effectiveTo !== undefined) pl.effectiveTo = newTo;
    if (data.items) {
      pl.items = data.items.map((i) => ({ productId: new mongoose.Types.ObjectId(i.productId), rate: i.rate, currency: 'INR' as const }));
    }
    pl.updatedBy = actorOid;
    await pl.save();
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
