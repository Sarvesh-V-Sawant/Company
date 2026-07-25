'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function CanteensPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Canteens' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Canteen Master</h1>
        <ComingSoonCard
          phase="Phase 30.01"
          title="Canteen Master"
          description="Manage main canteens and subsidiary canteens with hierarchy and contact details."
        />
      </div>
    </AdminLayout>
  );
}
