'use client';
/**
 * PO Inbox — a stage view of the chain pipeline.
 * All behaviour lives in the shared ChainBucketPage component so every stage
 * inbox stays consistent.
 */
import { FileText } from 'lucide-react';
import ChainBucketPage from '@components/desk/ChainBucketPage';

export default function PurchaseOrdersPage() {
  return (
    <ChainBucketPage
      title="PO Inbox"
      bucket="po"
      basePath="/desk/purchase-orders"
      icon={FileText}
      emptyTitle="No purchase orders waiting"
      emptyDescription="Chains appear here from the moment a canteen PO is received until it has been reviewed and altered."
    />
  );
}
