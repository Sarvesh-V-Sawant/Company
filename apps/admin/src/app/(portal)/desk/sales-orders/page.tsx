'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function SalesOrdersPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Sales Orders' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Sales Orders</h1>
        <ComingSoonCard
          phase="Phase 30.06"
          title="Sales Order Tracking"
          description="SO numbers, SO dates, linking to chains after portal approval."
        />
      </div>
    </AdminLayout>
  );
}
