'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function CommissionRulesPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Commission Rules' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Commission Rules</h1>
        <ComingSoonCard
          phase="Phase 30.08"
          title="Commission Rule Master"
          description="Percentage, per-unit, or flat commission rules scoped to manufacturer, product, or canteen."
        />
      </div>
    </AdminLayout>
  );
}
