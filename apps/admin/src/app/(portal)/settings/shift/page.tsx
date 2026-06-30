'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsShiftForm from '@components/forms/SettingsShiftForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsShiftPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Shift' }]}>
      <div className="max-w-xl space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Shift Settings</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading ? <Skeleton className="h-32 w-full" /> : <SettingsShiftForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
