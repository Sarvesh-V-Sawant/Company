'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function ManufacturersPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Manufacturers' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Manufacturer Master</h1>
        <ComingSoonCard
          phase="Phase 30.01"
          title="Manufacturer Master"
          description="Manufacturer details, portal credentials reference, primary contact, and commission rule linkage."
        />
      </div>
    </AdminLayout>
  );
}
