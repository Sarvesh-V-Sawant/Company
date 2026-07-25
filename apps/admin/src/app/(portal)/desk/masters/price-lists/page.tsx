'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function PriceListsPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Price Lists' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Price Lists</h1>
        <ComingSoonCard
          phase="Phase 30.01"
          title="Price List Master"
          description="Manufacturer and canteen-specific price lists with effective dates."
        />
      </div>
    </AdminLayout>
  );
}
