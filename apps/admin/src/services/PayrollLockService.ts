import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { PayrollLock } from '@models/PayrollLock';
import { PayrollRecord } from '@models/PayrollRecord';
import { AuditLog } from '@models/AuditLog';
import { AppError } from '@services/AuthService';

export class PayrollLockService {
  static async getStatus(yearMonth: string): Promise<{ isLocked: boolean; lockedAt?: string }> {
    await connectDB();
    const lock = await PayrollLock.findOne({ yearMonth }).lean() as { lockedAt: Date } | null;
    return lock ? { isLocked: true, lockedAt: lock.lockedAt.toISOString() } : { isLocked: false };
  }

  static async assertUnlocked(yearMonth: string): Promise<void> {
    const { isLocked } = await PayrollLockService.getStatus(yearMonth);
    if (isLocked) {
      throw new AppError('PAY_006', 409, `Payroll for ${yearMonth} is locked. Unlock before making changes.`);
    }
  }

  static async lock(params: { yearMonth: string; adminId: string }) {
    await connectDB();

    const existing = await PayrollLock.findOne({ yearMonth: params.yearMonth }).lean();
    if (existing) {
      throw new AppError('PAY_006', 409, `Payroll for ${params.yearMonth} is already locked.`);
    }

    const count = await PayrollRecord.countDocuments({ yearMonth: params.yearMonth });
    if (count === 0) {
      throw new AppError('PAY_002', 404, `No payroll records found for ${params.yearMonth}.`);
    }

    const lock = await PayrollLock.create({
      yearMonth: params.yearMonth,
      lockedAt:  new Date(),
      lockedBy:  new mongoose.Types.ObjectId(params.adminId),
    }) as unknown as { _id: mongoose.Types.ObjectId; yearMonth: string; lockedAt: Date };

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(params.adminId),
      action:      'PAYROLL_LOCKED',
      targetType:  'PayrollLock',
      targetId:    lock._id,
      meta:        { yearMonth: params.yearMonth },
    });

    return { yearMonth: lock.yearMonth, isLocked: true, lockedAt: lock.lockedAt.toISOString() };
  }

  static async unlock(params: { yearMonth: string; adminId: string; reason: string }) {
    await connectDB();

    const lock = await PayrollLock.findOneAndDelete({ yearMonth: params.yearMonth })
      .lean() as unknown as { _id: mongoose.Types.ObjectId } | null;
    if (!lock) {
      throw new AppError('PAY_007', 404, `Payroll for ${params.yearMonth} is not locked.`);
    }

    await AuditLog.create({
      performedBy: new mongoose.Types.ObjectId(params.adminId),
      action:      'PAYROLL_UNLOCKED',
      targetType:  'PayrollLock',
      targetId:    lock._id,
      meta:        { yearMonth: params.yearMonth, reason: params.reason },
    });

    return { yearMonth: params.yearMonth, isLocked: false };
  }
}
