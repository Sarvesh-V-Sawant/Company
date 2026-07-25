'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function ImportPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Bulk Import' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Bulk Excel Import</h1>
        <ComingSoonCard
          phase="Phase 30.02"
          title="Excel Bulk Import"
          description="Upload Excel for products, canteens, addresses, price lists, or PO lines. Preview rows before committing."
        />
      </div>
    </AdminLayout>
  );
}
