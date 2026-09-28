'use client';
/**
 * Commission — a stage view of the chain pipeline.
 * All behaviour lives in the shared ChainBucketPage component so every stage
 * inbox stays consistent.
 */
import { IndianRupee } from 'lucide-react';
import ChainBucketPage from '@components/desk/ChainBucketPage';

export default function CommissionPage() {
  return (
    <ChainBucketPage
      title="Commission"
      bucket="commission"
      basePath="/desk/commission"
      icon={IndianRupee}
      emptyTitle="No commission raised yet"
      emptyDescription="Once a canteen payment is received, the commission invoice is raised and tracked here."
    />
  );
}
