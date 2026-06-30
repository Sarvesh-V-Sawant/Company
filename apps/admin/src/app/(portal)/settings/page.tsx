'use client';
import Link from 'next/link';
import { Building2, CalendarX, Tags, MapPin, Clock, CalendarDays, ChevronRight } from 'lucide-react';
import AdminLayout from '@components/layout/AdminLayout';

const SETTINGS = [
  { href: '/settings/company',      icon: Building2,   label: 'Company',      description: 'Name, timezone, currency and address' },
  { href: '/settings/shift',        icon: Clock,       label: 'Shift',        description: 'Working hours and grace period' },
  { href: '/settings/working-days', icon: CalendarDays,label: 'Working Days',  description: 'Select which days are working days' },
  { href: '/settings/holidays',     icon: CalendarX,   label: 'Holidays',     description: 'Manage company holidays' },
  { href: '/settings/leave-types',  icon: Tags,        label: 'Leave Types',  description: 'Configure leave type codes and allocations' },
  { href: '/settings/geofence',     icon: MapPin,      label: 'Geofence',     description: 'Enforce location-based check-in/out' },
];

export default function SettingsPage() {
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings' }]}>
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {SETTINGS.map(({ href, icon: Icon, label, description }) => (
            <Link key={href} href={href} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                <Icon className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
