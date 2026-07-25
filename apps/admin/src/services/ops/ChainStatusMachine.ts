import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { Chain } from '@models/ops/Chain';
import { ChainEvent } from '@models/ops/ChainEvent';

export type ChainStatus =
  | 'PO_RECEIVED'
  | 'UNDER_REVIEW'
  | 'ALTERED'
  | 'PENDING_INTERNAL_APPROVAL'
  | 'SENT_TO_MANUFACTURER'
  | 'AWAITING_TAX_INVOICE'
  | 'TAX_INVOICE_RECEIVED'
  | 'UPLOADED_ON_PORTAL'
  | 'PORTAL_APPROVED'
  | 'SO_RECEIVED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_RECEIVED'
  | 'COMMISSION_RAISED'
  | 'COMMISSION_RECEIVED'
  | 'CLOSED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'REJECTED_ON_PORTAL'
  | 'SHORT_SUPPLIED'
  | 'PARTIALLY_DELIVERED';

// Maps each status to the set of statuses it can transition to.
const TRANSITIONS: Partial<Record<ChainStatus, ChainStatus[]>> = {
  PO_RECEIVED:              ['UNDER_REVIEW', 'ON_HOLD', 'CANCELLED'],
  UNDER_REVIEW:             ['ALTERED', 'ON_HOLD', 'CANCELLED'],
  ALTERED:                  ['PENDING_INTERNAL_APPROVAL', 'UNDER_REVIEW', 'ON_HOLD', 'CANCELLED'],
  PENDING_INTERNAL_APPROVAL: ['SENT_TO_MANUFACTURER', 'ALTERED', 'ON_HOLD', 'CANCELLED'],
  SENT_TO_MANUFACTURER:     ['AWAITING_TAX_INVOICE', 'REJECTED_ON_PORTAL', 'ON_HOLD', 'CANCELLED'],
  AWAITING_TAX_INVOICE:     ['TAX_INVOICE_RECEIVED', 'ON_HOLD', 'CANCELLED'],
  TAX_INVOICE_RECEIVED:     ['UPLOADED_ON_PORTAL', 'ON_HOLD', 'CANCELLED'],
  UPLOADED_ON_PORTAL:       ['PORTAL_APPROVED', 'REJECTED_ON_PORTAL', 'ON_HOLD'],
  PORTAL_APPROVED:          ['SO_RECEIVED', 'ON_HOLD'],
  SO_RECEIVED:              ['IN_TRANSIT', 'ON_HOLD', 'CANCELLED'],
  IN_TRANSIT:               ['DELIVERED', 'PARTIALLY_DELIVERED', 'SHORT_SUPPLIED', 'ON_HOLD'],
  DELIVERED:                ['PAYMENT_PENDING'],
  PARTIALLY_DELIVERED:      ['DELIVERED', 'SHORT_SUPPLIED', 'PAYMENT_PENDING'],
  SHORT_SUPPLIED:           ['PAYMENT_PENDING'],
  PAYMENT_PENDING:          ['PAYMENT_RECEIVED', 'ON_HOLD'],
  PAYMENT_RECEIVED:         ['COMMISSION_RAISED'],
  COMMISSION_RAISED:        ['COMMISSION_RECEIVED'],
  COMMISSION_RECEIVED:      ['CLOSED'],
  REJECTED_ON_PORTAL:       ['ALTERED', 'CANCELLED'],
  ON_HOLD:                  ['UNDER_REVIEW', 'ALTERED', 'PENDING_INTERNAL_APPROVAL',
                             'SENT_TO_MANUFACTURER', 'AWAITING_TAX_INVOICE',
                             'TAX_INVOICE_RECEIVED', 'UPLOADED_ON_PORTAL',
                             'SO_RECEIVED', 'IN_TRANSIT', 'PAYMENT_PENDING', 'CANCELLED'],
  CLOSED:                   [],
  CANCELLED:                [],
};

export function canTransition(from: ChainStatus, to: ChainStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function getAllowedTransitions(from: ChainStatus): ChainStatus[] {
  return TRANSITIONS[from] ?? [];
}

export async function transitionChain(
  chainId: string,
  toStatus: ChainStatus,
  actorUserId: string,
  message?: string,
): Promise<void> {
  await connectDB();
  const chain = await Chain.findById(chainId);
  if (!chain) throw new Error(`Chain ${chainId} not found`);

  const fromStatus = chain.status as ChainStatus;
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(`Invalid transition: ${fromStatus} → ${toStatus}`);
  }

  chain.status = toStatus;
  chain.updatedBy = new mongoose.Types.ObjectId(actorUserId);
  if (toStatus === 'ON_HOLD') chain.isOnHold = true;
  if (fromStatus === 'ON_HOLD' && toStatus !== 'ON_HOLD') chain.isOnHold = false;
  if (toStatus === 'CANCELLED') chain.cancelledAt = new Date();

  await chain.save();

  await ChainEvent.create({
    chainId: chain._id,
    eventType: 'STATUS_CHANGE',
    fromStatus,
    toStatus,
    message,
    actorUserId: new mongoose.Types.ObjectId(actorUserId),
  });
}
