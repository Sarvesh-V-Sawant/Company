'use client';
/**
 * Transit — a stage view of the chain pipeline.
 * All behaviour lives in the shared ChainBucketPage component so every stage
 * inbox stays consistent.
 */
import { Truck } from 'lucide-react';
import ChainBucketPage from '@components/desk/ChainBucketPage';

export default function TransitPage() {
  return (
    <ChainBucketPage
      title="Transit"
      bucket="transit"
      basePath="/desk/transit"
      icon={Truck}
      emptyTitle="Nothing in transit"
      emptyDescription="Dispatched consignments appear here until delivery is recorded at the canteen."
    />
  );
}
