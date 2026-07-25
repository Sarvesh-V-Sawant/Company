'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function ChainDetailPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Chains', href: '/desk/chains' }, { label: 'Chain Detail' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Chain Detail</h1>
        <ComingSoonCard
          phase="Phase 30.03"
          title="Chain Detail View"
          description="Full chain timeline, line items, documents, email log, and status transitions."
        />
      </div>
    </AdminLayout>
  );
}
