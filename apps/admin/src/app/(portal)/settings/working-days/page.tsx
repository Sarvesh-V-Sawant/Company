'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsWorkingDaysForm from '@components/forms/SettingsWorkingDaysForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsWorkingDaysPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Working Days' }]}>
      <div className="max-w-xl space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Working Days</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading ? <Skeleton className="h-40 w-full" /> : <SettingsWorkingDaysForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
