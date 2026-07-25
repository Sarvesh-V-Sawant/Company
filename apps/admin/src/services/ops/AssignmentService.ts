import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { Chain } from '@models/ops/Chain';
import { ChainEvent } from '@models/ops/ChainEvent';

export async function assignChain(
  chainId: string,
  toUserId: string,
  byUserId: string,
  reason?: string,
): Promise<void> {
  await connectDB();
  const chain = await Chain.findById(chainId);
  if (!chain) throw new Error(`Chain ${chainId} not found`);

  const fromUserId = chain.assignedTo;
  const toOid = new mongoose.Types.ObjectId(toUserId);
  const byOid = new mongoose.Types.ObjectId(byUserId);

  if (fromUserId) {
    chain.handoverHistory.push({
      fromUserId,
      toUserId: toOid,
      reason,
      at: new Date(),
      byUserId: byOid,
    });
  }

  chain.assignedTo = toOid;
  chain.updatedBy = byOid;
  await chain.save();

  await ChainEvent.create({
    chainId: chain._id,
    eventType: 'ASSIGNMENT_CHANGED',
    message: reason ?? `Assigned to user ${toUserId}`,
    metadata: { fromUserId: fromUserId?.toString(), toUserId },
    actorUserId: byOid,
  });
}
