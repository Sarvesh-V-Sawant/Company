import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { Manufacturer, type IManufacturer } from '@models/ops/Manufacturer';
import { Chain } from '@models/ops/Chain';
import { Product } from '@models/ops/Product';
import { CommissionRule } from '@models/ops/CommissionRule';
import { TERMINAL_STATUSES } from '@services/ops/ChainService';
import { AuditLog } from '@models/AuditLog';
import { calcSkip } from '@lib/utils/pagination';
import { escapeRegExp } from '@lib/utils/regex';
import { withDuplicateGuard } from '@lib/utils/ops-guards';

/**
 * A manufacturer's default commission rule must be a rule that targets that manufacturer
 * (scope "manufacturer", same manufacturerId). Product- or canteen-scoped rules do not.
 */
export async function assertDefaultCommissionRule(manufacturerId: string, ruleId: string): Promise<void> {
  const rule = await CommissionRule.findById(ruleId).select('scope manufacturerId').lean<{ scope: string; manufacturerId?: mongoose.Types.ObjectId }>();
  if (!rule) throw new AppError('OPS_064', 422, 'The default commission rule was not found.');
  if (rule.scope !== 'manufacturer' || String(rule.manufacturerId) !== manufacturerId) {
    throw new AppError('OPS_064', 422, 'The default commission rule must be a manufacturer-scope rule that targets this manufacturer.');
  }
}

export class ManufacturerService {
  static async list(params: {
    page: number; limit: number; search?: string;
    isActive?: boolean; sortBy: string; sortOrder: 'asc' | 'desc';
  }) {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (params.search) {
      const re = new RegExp(escapeRegExp(params.search), 'i');
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
    const existing = await Manufacturer.findOne({ code: { $regex: new RegExp(`^${escapeRegExp(codeUpper)}$`, 'i') } }).lean();
    if (existing) throw new AppError('OPS_010', 409, `Manufacturer code "${codeUpper}" already exists.`);
    const actorOid = new mongoose.Types.ObjectId(actorId);
    // The unique index on `code` is the real guard; the findOne above only gives a friendly fast path.
    const m = await withDuplicateGuard(
      () => Manufacturer.create({ ...data, code: codeUpper, createdBy: actorOid, updatedBy: actorOid }),
      'OPS_010',
      `Manufacturer code "${codeUpper}" already exists.`,
    );
    await AuditLog.create({ performedBy: actorOid, action: 'ops.manufacturer.create', targetType: 'Manufacturer', targetId: String(m._id) });
    return m.toObject();
  }

  static async update(id: string, data: Partial<Omit<IManufacturer, 'defaultCommissionRuleId'>> & { defaultCommissionRuleId?: string }, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid manufacturer ID.');
    const m = await Manufacturer.findById(id);
    if (!m) throw new AppError('OPS_009', 404, 'Manufacturer not found.');
    const actorOid = new mongoose.Types.ObjectId(actorId);
    const before = m.toObject();
    const { defaultCommissionRuleId, ...rest } = data;
    Object.assign(m, { ...rest, updatedBy: actorOid });
    if (defaultCommissionRuleId !== undefined) {
      if (defaultCommissionRuleId === '') {
        m.defaultCommissionRuleId = undefined;
      } else {
        await assertDefaultCommissionRule(id, defaultCommissionRuleId);
        m.defaultCommissionRuleId = new mongoose.Types.ObjectId(defaultCommissionRuleId);
      }
    }
    await m.save();
    await AuditLog.create({ performedBy: actorOid, action: 'ops.manufacturer.update', targetType: 'Manufacturer', targetId: id, changes: { before, after: m.toObject() } });
    return m.toObject();
  }

  static async setStatus(id: string, isActive: boolean, actorId: string) {
    await connectDB();
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new AppError('OPS_002', 400, 'Invalid manufacturer ID.');
    const m = await Manufacturer.findById(id).lean();
    if (!m) throw new AppError('OPS_009', 404, 'Manufacturer not found.');

    if (!isActive) {
      const openChains = await Chain.countDocuments({
        manufacturerId: id,
        status: { $nin: TERMINAL_STATUSES },
      });
      if (openChains > 0) {
        throw new AppError(
          'OPS_063',
          409,
          `Cannot deactivate — ${openChains} chain(s) referencing this manufacturer are still open. Close or cancel them first.`,
        );
      }
      // Active products under an inactive manufacturer can still be picked onto chains and
      // price lists, so they must be deactivated first.
      const activeProducts = await Product.countDocuments({ manufacturerId: id, isActive: true });
      if (activeProducts > 0) {
        throw new AppError(
          'OPS_063',
          409,
          `Cannot deactivate — ${activeProducts} active product(s) belong to this manufacturer. Deactivate them first.`,
        );
      }
    }

    const actorOid = new mongoose.Types.ObjectId(actorId);
    await Manufacturer.findByIdAndUpdate(id, { isActive, updatedBy: actorOid });
    await AuditLog.create({ performedBy: actorOid, action: isActive ? 'ops.manufacturer.activate' : 'ops.manufacturer.deactivate', targetType: 'Manufacturer', targetId: id });
  }
}
