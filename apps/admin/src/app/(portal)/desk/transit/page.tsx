'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function TransitPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Transit' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Transit & Delivery</h1>
        <ComingSoonCard
          phase="Phase 30.07"
          title="Transit Tracking"
          description="Transporter, LR number, e-way bill, expected delivery, POD upload."
        />
      </div>
    </AdminLayout>
  );
}
