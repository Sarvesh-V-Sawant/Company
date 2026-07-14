'use client';
import { useState } from 'react';
import { Map, Marker } from 'pigeon-maps';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { X, MapPin } from 'lucide-react';
import type { LocationFreshness } from '@services/RemoteLocationsService';

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

interface Props {
  locations: ActiveRemoteLocation[];
}

function markerColor(freshness: LocationFreshness): string {
  if (freshness === 'fresh') return '#16a34a';
  if (freshness === 'stale') return '#d97706';
  return '#9ca3af';
}

function fmtTime(iso: string) {
  try { return format(parseISO(iso), 'HH:mm'); } catch { return '—'; }
}

function fmtAge(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return '—'; }
}

function remoteSourceLabel(source: string) {
  return source === 'workAwayApproval' ? 'Approved WFH' : 'Field Override';
}

function PopupCard({
  loc,
  onClose,
}: {
  loc: ActiveRemoteLocation;
  onClose: () => void;
}) {
  const snap = loc.latestSnapshot;
  return (
    <div className="absolute z-50 bg-white rounded-xl shadow-xl border border-gray-200 w-64 p-4 text-sm">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Employee */}
      <div className="flex items-center gap-2 mb-3 pr-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold shrink-0">
          {loc.firstName[0]}{loc.lastName[0]}
        </div>
        <div>
          <p className="font-semibold text-gray-900 leading-tight">{loc.firstName} {loc.lastName}</p>
          <p className="text-xs text-gray-400">
            {loc.employeeCode}
            {loc.department && ` · ${loc.department}`}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-gray-600">
        {/* Designation */}
        {loc.designation && (
          <div className="flex justify-between">
            <span className="text-gray-400">Role</span>
            <span>{loc.designation}</span>
          </div>
        )}

        {/* Remote source */}
        <div className="flex justify-between">
          <span className="text-gray-400">Type</span>
          <span
            className={`rounded-full px-1.5 py-0.5 font-medium ${
              loc.remoteSource === 'workAwayApproval'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-purple-100 text-purple-700'
            }`}
          >
            {remoteSourceLabel(loc.remoteSource)}
          </span>
        </div>

        {/* Check-in time */}
        <div className="flex justify-between">
          <span className="text-gray-400">Checked in</span>
          <span>{fmtTime(loc.checkInTimestamp)}</span>
        </div>

        {/* Check-in address */}
        {loc.checkInAddress && (
          <div>
            <span className="text-gray-400">Check-in location</span>
            <p className="mt-0.5 text-gray-700">{loc.checkInAddress}</p>
          </div>
        )}

        {/* Latest snapshot */}
        {snap ? (
          <>
            <div className="flex justify-between">
              <span className="text-gray-400">Last update</span>
              <span>{fmtAge(snap.capturedAt)}</span>
            </div>
            {snap.address ? (
              <div>
                <span className="text-gray-400">Current location</span>
                <p className="mt-0.5 text-gray-700">{snap.address}</p>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-gray-400">Coords</span>
                <span className="font-mono">
                  {snap.latitude.toFixed(5)}, {snap.longitude.toFixed(5)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Accuracy</span>
              <span>±{Math.round(snap.accuracy)} m</span>
            </div>
          </>
        ) : (
          <p className="text-gray-400 italic">No location snapshot yet</p>
        )}
      </div>
    </div>
  );
}

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629]; // India centre
const DEFAULT_ZOOM = 5;

export default function RemoteLocationMap({ locations }: Props) {
  const [selected, setSelected] = useState<ActiveRemoteLocation | null>(null);

  // Only plot employees who have a snapshot
  const mappable = locations.filter((l) => l.latestSnapshot !== null);

  // Compute centre: average of snapshot coords, fall back to India
  let center: [number, number] = DEFAULT_CENTER;
  let zoom = DEFAULT_ZOOM;
  if (mappable.length > 0) {
    const avgLat =
      mappable.reduce((s, l) => s + l.latestSnapshot!.latitude, 0) / mappable.length;
    const avgLng =
      mappable.reduce((s, l) => s + l.latestSnapshot!.longitude, 0) / mappable.length;
    center = [avgLat, avgLng];
    zoom = mappable.length === 1 ? 13 : 10;
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200" style={{ height: 420 }}>
      <Map defaultCenter={center} defaultZoom={zoom} height={420}>
        {mappable.map((loc) => (
          <Marker
            key={loc.sessionId}
            anchor={[loc.latestSnapshot!.latitude, loc.latestSnapshot!.longitude]}
            color={markerColor(loc.freshness)}
            payload={loc}
            onClick={({ payload }) => setSelected(payload as ActiveRemoteLocation)}
          />
        ))}
      </Map>

      {/* Popup positioned absolute over map */}
      {selected && (
        <div className="absolute top-3 right-3">
          <PopupCard loc={selected} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs shadow border border-gray-100">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" />
          Live
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          Stale
        </span>
      </div>

      {/* Empty map overlay */}
      {mappable.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm gap-2">
          <MapPin className="h-6 w-6 text-gray-300" />
          <p className="text-sm text-gray-500">No location snapshots yet</p>
        </div>
      )}
    </div>
  );
}
