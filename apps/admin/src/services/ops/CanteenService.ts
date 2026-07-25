import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { Canteen, type ICanteen } from '@models/ops/Canteen';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function assertGstin(gstin?: string) {
  if (gstin && !GSTIN_RE.test(gstin)) {
    throw new AppError('OPS_001', 422, 'Invalid GSTIN format.');
  }
}

export class CanteenService {
  static async list(params: {
    page: number; limit: number; search?: string;
    type?: 'main' | 'subsidiary'; parentCanteenId?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.search) {
      const re = new RegExp(params.search, 'i');
      filter.$or = [{ code: re }, { name: re }];
    }
    if (params.type) filter.type = params.type;
    if (params.isActive !== undefined) filter.isActive = params.isActive;
    if (params.parentCanteenId) filter.parentCanteenId = new mongoose.Types.ObjectId(params.parentCanteenId);

    const sort: Record<string, 1 | -1> = { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 };
    const skip = calcSkip({ page: params.page, limit: params.limit });
    const [data, total] = await Promise.all([
      Canteen.find(filter).sort(sort).skip(skip).limit(params.limit).lean<ICanteen[]>(),
      Canteen.countDocuments(filter),
    ]);

    // Attach parent name and subsidiary count
    const enriched = await Promise.all(data.map(async (c) => {
      const extra: Record<string, unknown> = {};
      if (c.type === 'subsidiary' && c.parentCanteenId) {
        const parent = await Canteen.findById(c.parentCanteenId).select('code name').lean<ICanteen>();
        extra.parentCanteen = parent ? { _id: parent._id, code: parent.code, name: parent.name } : null;
      }
      if (c.type === 'main') {
        extra.subsidiaryCount = await Canteen.countDocuments({ parentCanteenId: c._id, isActive: true });
      }
      return { ...c, ...extra };
    }));

    return {
      data: enriched,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  static async getById(id: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid canteen ID.');
    const canteen = await Canteen.findById(id).lean<ICanteen>();
    if (!canteen) throw new AppError('OPS_003', 404, 'Canteen not found.');
    const extra: Record<string, unknown> = {};
    if (canteen.type === 'subsidiary' && canteen.parentCanteenId) {
      extra.parentCanteen = await Canteen.findById(canteen.parentCanteenId).select('code name').lean<ICanteen>();
    }
    if (canteen.type === 'main') {
      extra.subsidiaryCount = await Canteen.countDocuments({ parentCanteenId: canteen._id });
      extra.subsidiaries = await Canteen.find({ parentCanteenId: canteen._id }).select('code name isActive').lean<ICanteen[]>();
    }
    return { ...canteen, ...extra };
  }

  static async create(data: {
    code: string; name: string; type: 'main' | 'subsidiary';
    parentCanteenId?: string; gstin?: string; contactPerson?: string; phone?: string; email?: string;
  }, actorId: string) {
    await connectDB();
    assertGstin(data.gstin);

    const codeUpper = data.code.toUpperCase();
    const existing = await Canteen.findOne({ code: { $regex: new RegExp(`^${codeUpper}$`, 'i') } }).lean();
    if (existing) throw new AppError('OPS_004', 409, `Canteen code "${codeUpper}" already exists.`);

    if (data.type === 'subsidiary') {
      if (!data.parentCanteenId) throw new AppError('OPS_005', 422, 'parentCanteenId is required for subsidiary canteens.');
      const parent = await Canteen.findById(data.parentCanteenId).lean<ICanteen>();
      if (!parent) throw new AppError('OPS_006', 422, 'Parent canteen not found.');
      if (parent.type !== 'main') throw new AppError('OPS_007', 422, 'Parent must be a main canteen.');
    }

    const actorOid = new mongoose.Types.ObjectId(actorId);
    const canteen = await Canteen.create({
      ...data,
      code: codeUpper,
      parentCanteenId: data.parentCanteenId ? new mongoose.Types.ObjectId(data.parentCanteenId) : undefined,
      createdBy: actorOid,
      updatedBy: actorOid,
    });

    await AuditLog.create({ performedBy: actorOid, action: 'ops.canteen.create', targetType: 'Canteen', targetId: String(canteen._id) });
    return canteen.toObject();
  }

  static async update(id: string, data: Partial<{ name: string; gstin: string; contactPerson: string; phone: string; email: string }>, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid canteen ID.');
    assertGstin(data.gstin);

    const canteen = await Canteen.findById(id);
    if (!canteen) throw new AppError('OPS_003', 404, 'Canteen not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);

    const before = canteen.toObject();
    Object.assign(canteen, { ...data, updatedBy: actorOid });
    await canteen.save();

    await AuditLog.create({
      performedBy: actorOid, action: 'ops.canteen.update', targetType: 'Canteen', targetId: id,
      changes: { before, after: canteen.toObject() },
    });
    return canteen.toObject();
  }

  static async setStatus(id: string, isActive: boolean, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid canteen ID.');
    const canteen = await Canteen.findById(id).lean<ICanteen>();
    if (!canteen) throw new AppError('OPS_003', 404, 'Canteen not found.');

    if (!isActive && canteen.type === 'main') {
      const activeSubCount = await Canteen.countDocuments({ parentCanteenId: canteen._id, isActive: true });
      if (activeSubCount > 0) {
        throw new AppError('OPS_008', 409, `Cannot deactivate main canteen: it has ${activeSubCount} active subsidiary canteen(s). Deactivate them first.`);
      }
    }

    const actorOid = new mongoose.Types.ObjectId(actorId);
    await Canteen.findByIdAndUpdate(id, { isActive, updatedBy: actorOid });
    await AuditLog.create({
      performedBy: actorOid, action: isActive ? 'ops.canteen.activate' : 'ops.canteen.deactivate',
      targetType: 'Canteen', targetId: id,
    });
  }
}
