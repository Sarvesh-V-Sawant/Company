'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function AddressesPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Addresses' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Address Master</h1>
        <ComingSoonCard
          phase="Phase 30.01"
          title="Address Master"
          description="Ship-to and bill-to addresses for canteens and manufacturers."
        />
      </div>
    </AdminLayout>
  );
}
