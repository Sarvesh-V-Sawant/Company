'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function ProductsPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Products' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Product / SKU Master</h1>
        <ComingSoonCard
          phase="Phase 30.01"
          title="Product Master"
          description="SKU, name, UOM, pack size, HSN code, GST rate. Excel bulk import supported."
        />
      </div>
    </AdminLayout>
  );
}
