'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsAttendanceValidationForm from '@components/forms/SettingsAttendanceValidationForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsAttendanceValidationPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Attendance Validation' }]}>
      <div className="max-w-xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Attendance Check-in Validation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Control how the system verifies that employees are at the office when checking in.
            This is separate from app login — employees can always log in from anywhere.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading
            ? <Skeleton className="h-40 w-full" />
            : <SettingsAttendanceValidationForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
