'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsGeofenceForm from '@components/forms/SettingsGeofenceForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsGeofencePage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Geofence' }]}>
      <div className="max-w-xl space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Geofence Settings</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading ? <Skeleton className="h-40 w-full" /> : <SettingsGeofenceForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
