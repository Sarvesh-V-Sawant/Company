'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function ChainsPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Chains' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Chains</h1>
        <ComingSoonCard
          phase="Phase 30.02"
          title="Chain List"
          description="All chains with status, canteen, manufacturer, assigned-to, and quick-action filters."
        />
      </div>
    </AdminLayout>
  );
}
