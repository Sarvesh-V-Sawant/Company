import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { OpsAddress, type IOpsAddress } from '@models/ops/OpsAddress';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function assertGstin(gstin?: string) {
  if (gstin && !GSTIN_RE.test(gstin)) throw new AppError('OPS_001', 422, 'Invalid GSTIN format.');
}

export class AddressService {
  static async list(params: {
    page: number; limit: number; search?: string;
    ownerType?: 'canteen' | 'manufacturer' | 'company'; ownerId?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.search) {
      const re = new RegExp(params.search, 'i');
      filter.$or = [{ label: re }, { city: re }, { state: re }];
    }
    if (params.ownerType) filter.ownerType = params.ownerType;
    if (params.ownerId) filter.ownerId = new mongoose.Types.ObjectId(params.ownerId);
    if (params.isActive !== undefined) filter.isActive = params.isActive;
    const sort: Record<string, 1 | -1> = { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 };
    const skip = calcSkip({ page: params.page, limit: params.limit });
    const [data, total] = await Promise.all([
      OpsAddress.find(filter).sort(sort).skip(skip).limit(params.limit).lean<IOpsAddress[]>(),
      OpsAddress.countDocuments(filter),
    ]);
    return { data, pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) } };
  }

  static async getById(id: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid address ID.');
    const a = await OpsAddress.findById(id).lean<IOpsAddress>();
    if (!a) throw new AppError('OPS_015', 404, 'Address not found.');
    return a;
  }

  static async create(data: {
    ownerType: 'canteen' | 'manufacturer' | 'company'; ownerId?: string; label: string;
    addressType: 'shipTo' | 'billTo' | 'both'; line1: string; line2?: string;
    city: string; state: string; stateCode: string; pincode: string; gstin?: string; isDefault?: boolean;
  }, actorId: string) {
    await connectDB();
    assertGstin(data.gstin);
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const ownerOid = data.ownerId ? new mongoose.Types.ObjectId(data.ownerId) : undefined;

    if (data.isDefault && ownerOid) {
      // Atomically unset isDefault on all other addresses for the same owner + addressType
      await OpsAddress.updateMany(
        { ownerType: data.ownerType, ownerId: ownerOid, addressType: data.addressType, isDefault: true },
        { $set: { isDefault: false, updatedBy: actorOid } },
      );
    }

    const { ownerId: _raw, ...rest } = data;
    const a = await OpsAddress.create({
      ...rest,
      ...(ownerOid ? { ownerId: ownerOid } : {}),
      isDefault: data.isDefault ?? false,
      createdBy: actorOid,
      updatedBy: actorOid,
    });
    await AuditLog.create({ performedBy: actorOid, action: 'ops.address.create', targetType: 'OpsAddress', targetId: String(a._id) });
    return a.toObject();
  }

  static async update(id: string, data: Partial<Pick<IOpsAddress, 'label' | 'addressType' | 'line1' | 'line2' | 'city' | 'state' | 'stateCode' | 'pincode' | 'gstin' | 'isDefault'>>, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid address ID.');
    assertGstin(data.gstin);
    const a = await OpsAddress.findById(id);
    if (!a) throw new AppError('OPS_015', 404, 'Address not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);

    if (data.isDefault) {
      const addressType = data.addressType ?? a.addressType;
      await OpsAddress.updateMany(
        { ownerType: a.ownerType, ownerId: a.ownerId, addressType, isDefault: true, _id: { $ne: a._id } },
        { $set: { isDefault: false, updatedBy: actorOid } },
      );
    }

    const before = a.toObject();
    Object.assign(a, { ...data, updatedBy: actorOid });
    await a.save();
    await AuditLog.create({ performedBy: actorOid, action: 'ops.address.update', targetType: 'OpsAddress', targetId: id, changes: { before, after: a.toObject() } });
    return a.toObject();
  }

  static async setStatus(id: string, isActive: boolean, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid address ID.');
    const a = await OpsAddress.findById(id).lean();
    if (!a) throw new AppError('OPS_015', 404, 'Address not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    await OpsAddress.findByIdAndUpdate(id, { isActive, updatedBy: actorOid });
    await AuditLog.create({ performedBy: actorOid, action: isActive ? 'ops.address.activate' : 'ops.address.deactivate', targetType: 'OpsAddress', targetId: id });
  }
}
