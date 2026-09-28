'use client';
/**
 * Altered Orders — a stage view of the chain pipeline.
 * All behaviour lives in the shared ChainBucketPage component so every stage
 * inbox stays consistent.
 */
import { FilePen } from 'lucide-react';
import ChainBucketPage from '@components/desk/ChainBucketPage';

export default function AlteredOrdersPage() {
  return (
    <ChainBucketPage
      title="Altered Orders"
      bucket="altered"
      basePath="/desk/altered-orders"
      icon={FilePen}
      emptyTitle="No altered orders"
      emptyDescription="Chains appear here once quantities have been reworked, until the revised order is sent to the manufacturer."
    />
  );
}
