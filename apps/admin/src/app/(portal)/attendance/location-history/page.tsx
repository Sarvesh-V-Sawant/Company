'use client';
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MapPin, Clock, Search } from 'lucide-react';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { TableSkeleton } from '@components/ui/skeleton';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';

interface Snapshot {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeCode: string | null;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  address: string | null;
  geocodingStatus: string | null;
  source: string;
  dateString: string;
}

interface Res {
  success: boolean;
  data: {
    snapshots: Snapshot[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

function freshnessLabel(capturedAt: string) {
  const diffMs = Date.now() - new Date(capturedAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2)  return { label: 'Just now', color: 'text-green-600' };
  if (mins < 10) return { label: `${mins}m ago`, color: 'text-green-600' };
  if (mins < 60) return { label: `${mins}m ago`, color: 'text-amber-600' };
  const hrs = Math.floor(mins / 60);
  return { label: `${hrs}h ago`, color: 'text-red-500' };
}

export default function LocationHistoryPage() {
  const today = new Date().toISOString().split('T')[0];
  const [employeeId, setEmployeeId] = useState('');
  const [dateString, setDateString] = useState(today);
  const [query, setQuery] = useState<{ employeeId: string; dateString: string } | null>(null);

  const params = query
    ? `?dateString=${query.dateString}${query.employeeId ? `&employeeId=${query.employeeId}` : ''}&limit=100`
    : null;

  const { data, isLoading } = useSWR(
    params ? `/api/v1/attendance/location-snapshots${params}` : null,
    (url: string) => apiFetch<Res>(url),
    { refreshInterval: 30000 },
  );

  const snapshots = data?.data?.snapshots ?? [];

  return (
    <AdminLayout breadcrumb={[
      { label: 'Attendance', href: '/attendance' },
      { label: 'Location History' },
    ]}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Field Location History</h1>
          <p className="text-sm text-gray-500 mt-1">GPS snapshots recorded during remote check-in sessions.</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <Input
                type="date"
                value={dateString}
                onChange={e => setDateString(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Employee ID (optional — leave blank for all)</label>
              <Input
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="MongoDB employee ID"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setQuery({ employeeId, dateString })}
              disabled={!dateString}
            >
              <Search className="h-4 w-4 mr-1.5" /> Search
            </Button>
          </div>
        </div>

        {!query ? (
          <p className="text-sm text-gray-500 text-center py-8">Select a date and click Search to view snapshots.</p>
        ) : isLoading ? (
          <TableSkeleton />
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No location snapshots found for these filters.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Accuracy</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {snapshots.map(s => {
                    const { label, color } = freshnessLabel(s.capturedAt);
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {s.employeeName ?? s.employeeId}
                          {s.employeeCode && (
                            <span className="ml-1 text-xs text-gray-400">({s.employeeCode})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <span className="text-gray-700">{format(parseISO(s.capturedAt), 'HH:mm:ss')}</span>
                          <span className={`ml-1.5 text-xs ${color}`}>{label}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                          {s.address ? (
                            <span className="flex items-start gap-1">
                              <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />
                              {s.address}
                            </span>
                          ) : (
                            <span className="text-gray-400 flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" />
                              {s.geocodingStatus === 'pending'
                                ? 'Geocoding…'
                                : `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">±{Math.round(s.accuracy)}m</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {s.source === 'checkin' ? 'Check-in' : 'Periodic'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} — auto-refreshes every 30 seconds
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
