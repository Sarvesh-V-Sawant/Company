'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function PaymentsPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Payments' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Payments & Commission</h1>
        <ComingSoonCard
          phase="Phase 30.08"
          title="Payment & Commission Tracking"
          description="Canteen payment status, commission computation, commission invoice and receipt."
        />
      </div>
    </AdminLayout>
  );
}
