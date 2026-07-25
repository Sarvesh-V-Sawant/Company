import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { Manufacturer, type IManufacturer } from '@models/ops/Manufacturer';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';

export class ManufacturerService {
  static async list(params: {
    page: number; limit: number; search?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.search) {
      const re = new RegExp(params.search, 'i');
      filter.$or = [{ code: re }, { name: re }, { primaryEmail: re }];
    }
    if (params.isActive !== undefined) filter.isActive = params.isActive;
    const sort: Record<string, 1 | -1> = { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 };
    const skip = calcSkip({ page: params.page, limit: params.limit });
    const [data, total] = await Promise.all([
      Manufacturer.find(filter).sort(sort).skip(skip).limit(params.limit).lean<IManufacturer[]>(),
      Manufacturer.countDocuments(filter),
    ]);
    return { data, pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) } };
  }

  static async getById(id: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid manufacturer ID.');
    const m = await Manufacturer.findById(id).lean<IManufacturer>();
    if (!m) throw new AppError('OPS_009', 404, 'Manufacturer not found.');
    return m;
  }

  static async create(data: {
    code: string; name: string; gstin?: string; portalName?: string; portalUrl?: string;
    primaryEmail: string; additionalEmails?: string[]; contactPerson?: string; phone?: string;
  }, actorId: string) {
    await connectDB();
    const codeUpper = data.code.toUpperCase();
    const existing = await Manufacturer.findOne({ code: { $regex: new RegExp(`^${codeUpper}$`, 'i') } }).lean();
    if (existing) throw new AppError('OPS_010', 409, `Manufacturer code "${codeUpper}" already exists.`);
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const m = await Manufacturer.create({ ...data, code: codeUpper, createdBy: actorOid, updatedBy: actorOid });
    await AuditLog.create({ performedBy: actorOid, action: 'ops.manufacturer.create', targetType: 'Manufacturer', targetId: String(m._id) });
    return m.toObject();
  }

  static async update(id: string, data: Partial<IManufacturer>, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid manufacturer ID.');
    const m = await Manufacturer.findById(id);
    if (!m) throw new AppError('OPS_009', 404, 'Manufacturer not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const before = m.toObject();
    Object.assign(m, { ...data, updatedBy: actorOid });
    await m.save();
    await AuditLog.create({ performedBy: actorOid, action: 'ops.manufacturer.update', targetType: 'Manufacturer', targetId: id, changes: { before, after: m.toObject() } });
    return m.toObject();
  }

  static async setStatus(id: string, isActive: boolean, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid manufacturer ID.');
    const m = await Manufacturer.findById(id).lean();
    if (!m) throw new AppError('OPS_009', 404, 'Manufacturer not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    await Manufacturer.findByIdAndUpdate(id, { isActive, updatedBy: actorOid });
    await AuditLog.create({ performedBy: actorOid, action: isActive ? 'ops.manufacturer.activate' : 'ops.manufacturer.deactivate', targetType: 'Manufacturer', targetId: id });
  }
}
