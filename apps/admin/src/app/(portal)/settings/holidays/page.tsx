'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsHolidayForm from '@components/forms/SettingsHolidayForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsHolidaysPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Holidays' }]}>
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Holidays</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <SettingsHolidayForm
              holidays={(settings as unknown as { holidays?: { date: string; name: string }[] })?.holidays ?? []}
              onSuccess={refresh}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
