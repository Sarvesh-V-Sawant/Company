'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsLeaveTypeForm from '@components/forms/SettingsLeaveTypeForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsLeaveTypesPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Leave Types' }]}>
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Leave Types</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <SettingsLeaveTypeForm
              leaveTypes={(settings as unknown as { leaveTypes?: { code: string; name: string; defaultDays: number; isPaid: boolean; carryForward: boolean }[] })?.leaveTypes ?? []}
              onSuccess={refresh}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
