import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { Product, type IProduct } from '@models/ops/Product';
import { Manufacturer } from '@models/ops/Manufacturer';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';

export class ProductService {
  static async list(params: {
    page: number; limit: number; search?: string; manufacturerId?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.search) {
      const re = new RegExp(params.search, 'i');
      filter.$or = [{ sku: re }, { name: re }];
    }
    if (params.manufacturerId) filter.manufacturerId = new mongoose.Types.ObjectId(params.manufacturerId);
    if (params.isActive !== undefined) filter.isActive = params.isActive;
    const sort: Record<string, 1 | -1> = { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 };
    const skip = calcSkip({ page: params.page, limit: params.limit });
    const [data, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(params.limit)
        .populate('manufacturerId', 'code name').lean<IProduct[]>(),
      Product.countDocuments(filter),
    ]);
    return { data, pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) } };
  }

  static async getById(id: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid product ID.');
    const p = await Product.findById(id).populate('manufacturerId', 'code name').lean<IProduct>();
    if (!p) throw new AppError('OPS_011', 404, 'Product not found.');
    return p;
  }

  static async create(data: {
    sku: string; name: string; description?: string; manufacturerId: string;
    uom: string; packSize?: number; hsnCode?: string; gstRatePercent?: number;
  }, actorId: string) {
    await connectDB();
    const skuUpper = data.sku.toUpperCase();
    const existing = await Product.findOne({ sku: { $regex: new RegExp(`^${skuUpper}$`, 'i') } }).lean();
    if (existing) throw new AppError('OPS_012', 409, `SKU "${skuUpper}" already exists.`);

    const mfr = await Manufacturer.findById(data.manufacturerId).lean() as { isActive: boolean } | null;
    if (!mfr) throw new AppError('OPS_013', 422, 'Manufacturer not found.');
    if (!mfr.isActive) throw new AppError('OPS_014', 422, 'Manufacturer is inactive.');

    const actorOid = new mongoose.Types.ObjectId(actorId);
    const p = await Product.create({
      ...data,
      sku: skuUpper,
      manufacturerId: new mongoose.Types.ObjectId(data.manufacturerId),
      createdBy: actorOid,
      updatedBy: actorOid,
    });
    await AuditLog.create({ performedBy: actorOid, action: 'ops.product.create', targetType: 'Product', targetId: String(p._id) });
    return p.toObject();
  }

  static async update(id: string, data: Partial<Pick<IProduct, 'name' | 'description' | 'uom' | 'packSize' | 'hsnCode' | 'gstRatePercent'>>, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid product ID.');
    const p = await Product.findById(id);
    if (!p) throw new AppError('OPS_011', 404, 'Product not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const before = p.toObject();
    Object.assign(p, { ...data, updatedBy: actorOid });
    await p.save();
    await AuditLog.create({ performedBy: actorOid, action: 'ops.product.update', targetType: 'Product', targetId: id, changes: { before, after: p.toObject() } });
    return p.toObject();
  }

  static async setStatus(id: string, isActive: boolean, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid product ID.');
    const p = await Product.findById(id).lean();
    if (!p) throw new AppError('OPS_011', 404, 'Product not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    await Product.findByIdAndUpdate(id, { isActive, updatedBy: actorOid });
    await AuditLog.create({ performedBy: actorOid, action: isActive ? 'ops.product.activate' : 'ops.product.deactivate', targetType: 'Product', targetId: id });
  }
}
