import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { CommissionRule, type ICommissionRule } from '@models/ops/CommissionRule';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';

export class CommissionRuleService {
  static async list(params: {
    page: number; limit: number; search?: string;
    scope?: 'manufacturer' | 'product' | 'canteen'; manufacturerId?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.scope) filter.scope = params.scope;
    if (params.manufacturerId) filter.manufacturerId = new mongoose.Types.ObjectId(params.manufacturerId);
    if (params.isActive !== undefined) filter.isActive = params.isActive;
    const sort: Record<string, 1 | -1> = { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 };
    const skip = calcSkip({ page: params.page, limit: params.limit });
    const [data, total] = await Promise.all([
      CommissionRule.find(filter).sort(sort).skip(skip).limit(params.limit)
        .populate('manufacturerId', 'code name')
        .populate('productId', 'sku name')
        .populate('canteenId', 'code name')
        .lean<ICommissionRule[]>(),
      CommissionRule.countDocuments(filter),
    ]);
    return { data, pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) } };
  }

  static async getById(id: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid commission rule ID.');
    const r = await CommissionRule.findById(id)
      .populate('manufacturerId', 'code name')
      .populate('productId', 'sku name')
      .populate('canteenId', 'code name')
      .lean<ICommissionRule>();
    if (!r) throw new AppError('OPS_017', 404, 'Commission rule not found.');
    return r;
  }

  static async create(data: {
    scope: 'manufacturer' | 'product' | 'canteen';
    manufacturerId?: string; productId?: string; canteenId?: string;
    type: 'percentage' | 'perUnit' | 'flat'; value: number;
    effectiveFrom: string; effectiveTo?: string;
    gstApplicable?: boolean; sacCode?: string; notes?: string;
  }, actorId: string) {
    await connectDB();
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const r = await CommissionRule.create({
      scope: data.scope,
      manufacturerId: data.manufacturerId ? new mongoose.Types.ObjectId(data.manufacturerId) : undefined,
      productId: data.productId ? new mongoose.Types.ObjectId(data.productId) : undefined,
      canteenId: data.canteenId ? new mongoose.Types.ObjectId(data.canteenId) : undefined,
      type: data.type,
      value: data.value,
      effectiveFrom: new Date(data.effectiveFrom),
      effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
      gstApplicable: data.gstApplicable,
      sacCode: data.sacCode,
      notes: data.notes,
      createdBy: actorOid,
      updatedBy: actorOid,
    });
    await AuditLog.create({ performedBy: actorOid, action: 'ops.commission-rule.create', targetType: 'CommissionRule', targetId: String(r._id) });
    return r.toObject();
  }

  static async update(id: string, data: { value?: number; effectiveTo?: string; gstApplicable?: boolean; sacCode?: string; notes?: string }, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid commission rule ID.');
    const r = await CommissionRule.findById(id);
    if (!r) throw new AppError('OPS_017', 404, 'Commission rule not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const before = r.toObject();
    if (data.value !== undefined) r.value = data.value;
    if (data.effectiveTo !== undefined) r.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : undefined;
    if (data.gstApplicable !== undefined) r.gstApplicable = data.gstApplicable;
    if (data.sacCode !== undefined) r.sacCode = data.sacCode;
    if (data.notes !== undefined) r.notes = data.notes;
    r.updatedBy = actorOid;
    await r.save();
    await AuditLog.create({ performedBy: actorOid, action: 'ops.commission-rule.update', targetType: 'CommissionRule', targetId: id, changes: { before, after: r.toObject() } });
    return r.toObject();
  }

  static async setStatus(id: string, isActive: boolean, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid commission rule ID.');
    const r = await CommissionRule.findById(id).lean();
    if (!r) throw new AppError('OPS_017', 404, 'Commission rule not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    await CommissionRule.findByIdAndUpdate(id, { isActive, updatedBy: actorOid });
    await AuditLog.create({ performedBy: actorOid, action: isActive ? 'ops.commission-rule.activate' : 'ops.commission-rule.deactivate', targetType: 'CommissionRule', targetId: id });
  }

  /**
   * resolveCommissionRule: find the most specific active rule for a product on a given date.
   * Specificity: product-level > canteen-level > manufacturer-level.
   * Returns null if no rule found.
   */
  static async resolveCommissionRule(
    productId: string, manufacturerId: string, canteenId: string, onDate: Date,
  ): Promise<Pick<ICommissionRule, 'type' | 'value' | 'gstApplicable' | 'sacCode'> | null> {
    await connectDB();
    const dateFilter = { effectiveFrom: { $lte: onDate }, $or: [{ effectiveTo: null }, { effectiveTo: { $gte: onDate } }] };
    const fields = 'type value gstApplicable sacCode';

    const productRule = await CommissionRule.findOne({
      scope: 'product', productId: new mongoose.Types.ObjectId(productId), isActive: true, ...dateFilter,
    }).select(fields).lean<ICommissionRule>();
    if (productRule) return productRule;

    const canteenRule = await CommissionRule.findOne({
      scope: 'canteen', canteenId: new mongoose.Types.ObjectId(canteenId), isActive: true, ...dateFilter,
    }).select(fields).lean<ICommissionRule>();
    if (canteenRule) return canteenRule;

    const mfrRule = await CommissionRule.findOne({
      scope: 'manufacturer', manufacturerId: new mongoose.Types.ObjectId(manufacturerId), isActive: true, ...dateFilter,
    }).select(fields).lean<ICommissionRule>();
    return mfrRule;
  }
}
