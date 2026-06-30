'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsCompanyForm from '@components/forms/SettingsCompanyForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsCompanyPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Company' }]}>
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Company Settings</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading ? <Skeleton className="h-48 w-full" /> : <SettingsCompanyForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
