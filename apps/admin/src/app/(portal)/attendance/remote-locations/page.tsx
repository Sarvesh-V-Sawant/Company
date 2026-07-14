'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { MapPin, RefreshCcw, Wifi, WifiOff, Clock } from 'lucide-react';
import AdminLayout from '@components/layout/AdminLayout';
import { TableSkeleton } from '@components/ui/skeleton';
import { apiFetch } from '@lib/utils/api-client';
import type { LocationFreshness } from '@services/RemoteLocationsService';

const RemoteLocationMap = dynamic(
  () => import('@components/maps/RemoteLocationMap'),
  { ssr: false, loading: () => <div className="h-[420px] rounded-xl border border-gray-200 bg-gray-50 animate-pulse" /> },
);

interface LatestSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  address: string | null;
  geocodingStatus: string | null;
}

interface ActiveRemoteLocation {
  sessionId: string;
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string | null;
  designation: string | null;
  remoteSource: string;
  checkInTimestamp: string;
  checkInAddress: string | null;
  latestSnapshot: LatestSnapshot | null;
  freshness: LocationFreshness;
}

interface ApiResponse {
  locations: ActiveRemoteLocation[];
  total: number;
}

function FreshnessChip({ freshness }: { freshness: LocationFreshness }) {
  if (freshness === 'fresh') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <Wifi className="h-3 w-3" />
        Live
      </span>
    );
  }
  if (freshness === 'stale') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Clock className="h-3 w-3" />
        Stale
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
      <WifiOff className="h-3 w-3" />
      No signal
    </span>
  );
}

function RemoteSourceBadge({ source }: { source: string }) {
  const label = source === 'workAwayApproval' ? 'Approved WFH' : 'Field Override';
  const color = source === 'workAwayApproval'
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-purple-100 text-purple-700';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function fmtTime(iso: string) {
  try { return format(parseISO(iso), 'HH:mm'); } catch { return '—'; }
}

function fmtAge(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return '—'; }
}

export default function RemoteLocationsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/v1/attendance/remote-active-locations?_k=${refreshKey}`,
    (u: string) => apiFetch<ApiResponse>(u),
    { refreshInterval: 60_000 },
  );

  const locations = data?.locations ?? [];

  return (
    <AdminLayout breadcrumb={[{ label: 'Attendance', href: '/attendance' }, { label: 'Remote Locations' }]}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Active Remote Employees</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Employees currently checked in remotely — updates every 60 s
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <span className="text-sm text-gray-500">
                {data.total} active
              </span>
            )}
            <button
              onClick={() => { setRefreshKey((k) => k + 1); mutate(); }}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs — mirrors attendance page nav */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm self-start w-fit">
          <a href="/attendance" className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-white hover:text-gray-900 transition-colors">Daily</a>
          <a href="/attendance/weekly" className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-white hover:text-gray-900 transition-colors">Weekly</a>
          <a href="/attendance/monthly" className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-white hover:text-gray-900 transition-colors">Monthly</a>
          <span className="px-3 py-1.5 rounded-md bg-white text-gray-900 font-medium shadow-sm">Remote</span>
        </div>

        {/* Map */}
        <RemoteLocationMap locations={locations} />

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableSkeleton rows={4} cols={6} />
              </table>
            </div>
          ) : locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <MapPin className="h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No active remote employees</p>
              <p className="text-xs text-gray-400">Employees who check in outside the geofence will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Checked In</th>
                    <th className="px-4 py-3">Last Known Location</th>
                    <th className="px-4 py-3">Last Update</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {locations.map((loc) => (
                    <tr key={loc.sessionId} className="hover:bg-gray-50 transition-colors">
                      {/* Employee */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold shrink-0">
                            {loc.firstName[0]}{loc.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {loc.firstName} {loc.lastName}
                            </p>
                            <p className="text-xs text-gray-400">
                              {loc.employeeCode}
                              {loc.department && ` · ${loc.department}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Remote source */}
                      <td className="px-4 py-3">
                        <RemoteSourceBadge source={loc.remoteSource} />
                      </td>

                      {/* Check-in time + address */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{fmtTime(loc.checkInTimestamp)}</p>
                        {loc.checkInAddress && (
                          <p className="text-xs text-gray-400 mt-0.5 max-w-[180px] truncate">{loc.checkInAddress}</p>
                        )}
                      </td>

                      {/* Latest location */}
                      <td className="px-4 py-3">
                        {loc.latestSnapshot ? (
                          <div className="flex items-start gap-1">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              {loc.latestSnapshot.address ? (
                                <p className="text-gray-700 max-w-[200px]">{loc.latestSnapshot.address}</p>
                              ) : (
                                <p className="text-gray-500 font-mono text-xs">
                                  {loc.latestSnapshot.latitude.toFixed(5)}, {loc.latestSnapshot.longitude.toFixed(5)}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-0.5">
                                ±{Math.round(loc.latestSnapshot.accuracy)} m
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Last update time */}
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {loc.latestSnapshot ? fmtAge(loc.latestSnapshot.capturedAt) : '—'}
                      </td>

                      {/* Freshness */}
                      <td className="px-4 py-3">
                        <FreshnessChip freshness={loc.freshness} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
