'use client';
/**
 * Payments — a stage view of the chain pipeline.
 * All behaviour lives in the shared ChainBucketPage component so every stage
 * inbox stays consistent.
 */
import { CreditCard } from 'lucide-react';
import ChainBucketPage from '@components/desk/ChainBucketPage';

export default function PaymentsPage() {
  return (
    <ChainBucketPage
      title="Payments"
      bucket="payment"
      basePath="/desk/payments"
      icon={CreditCard}
      emptyTitle="No payments pending"
      emptyDescription="Delivered chains appear here until the canteen has paid the manufacturer in full."
    />
  );
}
