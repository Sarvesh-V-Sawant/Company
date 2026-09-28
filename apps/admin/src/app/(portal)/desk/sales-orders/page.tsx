'use client';
/**
 * Sales Orders — a stage view of the chain pipeline.
 * All behaviour lives in the shared ChainBucketPage component so every stage
 * inbox stays consistent.
 */
import { FileCheck } from 'lucide-react';
import ChainBucketPage from '@components/desk/ChainBucketPage';

export default function SalesOrdersPage() {
  return (
    <ChainBucketPage
      title="Sales Orders"
      bucket="so"
      basePath="/desk/sales-orders"
      icon={FileCheck}
      emptyTitle="No sales orders yet"
      emptyDescription="Once the portal approves the uploaded tax invoice, the sales order is recorded here."
    />
  );
}
