import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { CommissionRule, type ICommissionRule } from '@models/ops/CommissionRule';
import { Manufacturer } from '@models/ops/Manufacturer';
import { Product } from '@models/ops/Product';
import { Canteen } from '@models/ops/Canteen';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';
import { escapeRegExp } from '@lib/utils/regex';
import { withDuplicateGuard } from '@lib/utils/ops-guards';

/** The scope target must exist — a rule pointing at nothing never applies and cannot be found again. */
export async function assertCommissionScopeExists(
  scope: 'manufacturer' | 'product' | 'canteen',
  scopeId: string,
): Promise<void> {
  const Model = scope === 'manufacturer' ? Manufacturer : scope === 'product' ? Product : Canteen;
  const found = await Model.findById(scopeId).select('_id').lean();
  if (!found) throw new AppError('OPS_064', 422, `The ${scope} for this commission rule was not found.`);
}

/** OPS_023: active commission rule with overlapping window exists for the same scope key */
export async function assertNoCommissionOverlap(
  scope: 'manufacturer' | 'product' | 'canteen',
  scopeId: mongoose.Types.ObjectId,
  effectiveFrom: Date,
  effectiveTo: Date | undefined,
  excludeId?: mongoose.Types.ObjectId,
) {
  const scopeField = scope === 'manufacturer' ? 'manufacturerId' : scope === 'product' ? 'productId' : 'canteenId';
  const overlapCondition = {
    effectiveFrom: { $lte: effectiveTo ?? new Date('9999-12-31') },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: effectiveFrom } }],
  };
  const q: Record<string, unknown> = { scope, [scopeField]: scopeId, isActive: true, ...overlapCondition };
  if (excludeId) q._id = { $ne: excludeId };

  const conflict = await CommissionRule.findOne(q).lean();
  if (conflict) {
    throw new AppError('OPS_023', 409, 'An active commission rule with an overlapping effective date window already exists for this scope.');
  }
}

export class CommissionRuleService {
  static async list(params: {
    page: number; limit: number; search?: string;
    scope?: 'manufacturer' | 'product' | 'canteen'; manufacturerId?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.search) {
      const re = new RegExp(escapeRegExp(params.search), 'i');
      const [mfrIds, productIds, canteenIds] = await Promise.all([
        Manufacturer.find({ $or: [{ code: re }, { name: re }] }).select('_id').lean(),
        Product.find({ $or: [{ sku: re }, { name: re }] }).select('_id').lean(),
        Canteen.find({ $or: [{ code: re }, { name: re }] }).select('_id').lean(),
      ]);
      filter.$or = [
        { manufacturerId: { $in: mfrIds.map((m) => m._id) } },
        { productId: { $in: productIds.map((p) => p._id) } },
        { canteenId: { $in: canteenIds.map((c) => c._id) } },
      ];
    }
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
    const scopeField = data.scope === 'manufacturer' ? data.manufacturerId : data.scope === 'product' ? data.productId : data.canteenId;
    const scopeOid = new mongoose.Types.ObjectId(scopeField);
    const from = new Date(data.effectiveFrom);
    const to   = data.effectiveTo ? new Date(data.effectiveTo) : undefined;

    await assertCommissionScopeExists(data.scope, String(scopeField));
    await assertNoCommissionOverlap(data.scope, scopeOid, from, to);

    const actorOid = new mongoose.Types.ObjectId(actorId);
    // Only the id matching the scope is stored; a stray second id would make the row match two scopes.
    const r = await withDuplicateGuard(
      () => CommissionRule.create({
        scope: data.scope,
        manufacturerId: data.scope === 'manufacturer' ? scopeOid : undefined,
        productId: data.scope === 'product' ? scopeOid : undefined,
        canteenId: data.scope === 'canteen' ? scopeOid : undefined,
        type: data.type,
        value: data.value,
        effectiveFrom: from,
        effectiveTo: to,
        gstApplicable: data.gstApplicable,
        sacCode: data.sacCode,
        notes: data.notes,
        createdBy: actorOid,
        updatedBy: actorOid,
      }),
      'OPS_023',
      'A commission rule for this scope and start date already exists (it may be inactive).',
    );
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

    if (data.effectiveTo !== undefined) {
      const newTo = data.effectiveTo ? new Date(data.effectiveTo) : undefined;
      if (newTo && newTo.getTime() < r.effectiveFrom.getTime()) {
        throw new AppError('OPS_025', 422, 'effectiveTo cannot be before effectiveFrom.');
      }
      const scopeField = r.scope === 'manufacturer' ? r.manufacturerId : r.scope === 'product' ? r.productId : r.canteenId;
      if (scopeField) {
        await assertNoCommissionOverlap(r.scope, scopeField as mongoose.Types.ObjectId, r.effectiveFrom, newTo, r._id as mongoose.Types.ObjectId);
      }
      r.effectiveTo = newTo;
    }
    if (data.value !== undefined) r.value = data.value;
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
