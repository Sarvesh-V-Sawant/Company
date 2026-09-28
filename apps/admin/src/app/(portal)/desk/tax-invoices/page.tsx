'use client';
/**
 * Tax Invoices — a stage view of the chain pipeline.
 * All behaviour lives in the shared ChainBucketPage component so every stage
 * inbox stays consistent.
 */
import { ReceiptText } from 'lucide-react';
import ChainBucketPage from '@components/desk/ChainBucketPage';

export default function TaxInvoicesPage() {
  return (
    <ChainBucketPage
      title="Tax Invoices"
      bucket="taxInvoice"
      basePath="/desk/tax-invoices"
      icon={ReceiptText}
      emptyTitle="No tax invoices pending"
      emptyDescription="Chains awaiting or holding the manufacturer's tax invoice appear here."
    />
  );
}
