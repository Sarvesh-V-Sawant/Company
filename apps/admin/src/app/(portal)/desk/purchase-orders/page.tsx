'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function PurchaseOrdersPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'PO Inbox' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">PO Inbox</h1>
        <ComingSoonCard
          phase="Phase 30.02"
          title="Purchase Order Upload & Import"
          description="Upload PO from manufacturer portal, import lines via Excel, start a new chain."
        />
      </div>
    </AdminLayout>
  );
}
