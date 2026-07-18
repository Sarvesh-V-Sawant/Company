'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsPayrollRulesForm from '@components/forms/SettingsPayrollRulesForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsPayrollRulesPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Payroll Rules' }]}>
      <div className="max-w-xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payroll Rules</h1>
          <p className="text-sm text-gray-500 mt-1">Configure how attendance marks affect salary deductions.</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading
            ? <Skeleton className="h-24 w-full" />
            : <SettingsPayrollRulesForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
