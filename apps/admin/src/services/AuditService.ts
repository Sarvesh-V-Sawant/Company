import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AuditLog } from '@models/AuditLog';
import { User } from '@models/User';
import { AppError } from '@services/AuthService';

interface AuditLogParams {
  performedBy: mongoose.Types.ObjectId | string;
  action: string;
  targetType: string;
  targetId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogListQuery {
  search?: string;
  action?: string;
  entity?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

export class AuditService {
  static async log(params: AuditLogParams): Promise<void> {
    const performedBy =
      typeof params.performedBy === 'string'
        ? new mongoose.Types.ObjectId(params.performedBy)
        : params.performedBy;

    await AuditLog.create({
      performedBy,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      changes: params.changes,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  static async list(query: AuditLogListQuery) {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = { $regex: query.action, $options: 'i' };
    if (query.entity) filter.targetType = { $regex: query.entity, $options: 'i' };
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.$gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        range.$lte = to;
      }
      filter.createdAt = range;
    }

    const skip = (query.page - 1) * query.limit;

    type RawLog = {
      _id: mongoose.Types.ObjectId;
      performedBy: mongoose.Types.ObjectId;
      action: string;
      targetType: string;
      targetId?: string;
      changes?: Record<string, unknown>;
      ipAddress?: string;
      createdAt: Date;
    };

    const [docs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean() as unknown as Promise<RawLog[]>,
      AuditLog.countDocuments(filter),
    ]);

    // Batch-populate performer names
    const uniqueIds = [...new Set(docs.map((d) => d.performedBy.toHexString()))];
    const users = await User.find(
      { _id: { $in: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      'firstName lastName email',
    ).lean() as { _id: mongoose.Types.ObjectId; firstName: string; lastName: string; email: string }[];
    const userMap = new Map(users.map((u) => [u._id.toHexString(), u]));

    // Apply text search across action, entity, performer name
    let data = docs.map((d) => {
      const u = userMap.get(d.performedBy.toHexString());
      return {
        _id:       d._id.toHexString(),
        userId:    u ?? d.performedBy.toHexString(),
        action:    d.action,
        entity:    d.targetType,
        entityId:  d.targetId ?? null,
        ip:        d.ipAddress ?? null,
        changes:   d.changes ?? null,
        createdAt: d.createdAt.toISOString(),
      };
    });

    if (query.search) {
      const s = query.search.toLowerCase();
      data = data.filter((row) => {
        const nameStr = typeof row.userId === 'object'
          ? `${row.userId.firstName} ${row.userId.lastName} ${row.userId.email}`.toLowerCase()
          : String(row.userId).toLowerCase();
        return (
          row.action.toLowerCase().includes(s) ||
          row.entity.toLowerCase().includes(s) ||
          nameStr.includes(s) ||
          (row.entityId ?? '').toLowerCase().includes(s)
        );
      });
    }

    return {
      data,
      pagination: {
        page:       query.page,
        limit:      query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  static async getById(id: string) {
    await connectDB();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('GEN_002', 404, 'Audit log not found.');
    }

    type RawLog = {
      _id: mongoose.Types.ObjectId;
      performedBy: mongoose.Types.ObjectId;
      action: string;
      targetType: string;
      targetId?: string;
      changes?: Record<string, unknown>;
      ipAddress?: string;
      createdAt: Date;
    };

    const doc = await AuditLog.findById(id).lean() as unknown as RawLog | null;
    if (!doc) throw new AppError('GEN_002', 404, 'Audit log not found.');

    const user = await User.findById(doc.performedBy, 'firstName lastName email').lean() as { _id: mongoose.Types.ObjectId; firstName: string; lastName: string; email: string } | null;

    return {
      _id:       doc._id.toHexString(),
      userId:    user ?? doc.performedBy.toHexString(),
      action:    doc.action,
      entity:    doc.targetType,
      entityId:  doc.targetId ?? null,
      ip:        doc.ipAddress ?? null,
      changes:   doc.changes ?? null,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
