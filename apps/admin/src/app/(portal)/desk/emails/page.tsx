'use client';
import AdminLayout from '@components/layout/AdminLayout';
import ComingSoonCard from '@components/shared/ComingSoonCard';

export default function EmailsPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Emails' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Email Outbox</h1>
        <ComingSoonCard
          phase="Phase 30.04"
          title="Email Draft & Send"
          description="Compose order confirmation to manufacturer, preview draft, select PDF/Excel format, send via Brevo."
        />
      </div>
    </AdminLayout>
  );
}
