'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function DeskDashboardPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk' }]}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Work Desk</h1>
          <p className="text-sm text-gray-500 mt-0.5">Operations dashboard — chains, orders, and commissions</p>
        </div>
        <ComingSoonCard
          phase="Phase 30.01"
          title="Operations Dashboard"
          description="KPI tiles: open chains, chains awaiting action, pending tax invoices, in-transit orders."
        />
      </div>
    </AdminLayout>
  );
}
