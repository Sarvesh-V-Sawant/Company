'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function DeskReportsPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Reports' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Operations Reports</h1>
        <ComingSoonCard
          phase="Phase 30.09"
          title="Reports"
          description="Chain summary, commission earned, manufacturer-wise volume, canteen-wise history."
        />
      </div>
    </AdminLayout>
  );
}
