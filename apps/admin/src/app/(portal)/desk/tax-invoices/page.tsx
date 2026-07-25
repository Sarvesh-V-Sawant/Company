'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function TaxInvoicesPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Tax Invoices' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Tax Invoices</h1>
        <ComingSoonCard
          phase="Phase 30.05"
          title="Tax Invoice Management"
          description="Upload manufacturer tax invoices, link to chains, track portal upload status."
        />
      </div>
    </AdminLayout>
  );
}
