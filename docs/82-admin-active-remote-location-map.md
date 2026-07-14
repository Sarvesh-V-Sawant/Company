# Phase 17.05 + 17.06 — Admin Active Remote Location View with Map

**Date:** 2026-07-11
**Scope:** Admin-only list of currently active remote/field employees with latest location snapshot
**Rules:** No secrets printed. No commits/pushes/deploys. No background tracking. No payroll.

---

## Phase A — Audit Findings

| Area | Finding |
|---|---|
| Map library | **None installed** (no leaflet, mapbox, react-map-gl, pigeon-maps) |
| CSS map support | N/A — no map lib |
| Dashboard location widget | None |
| Existing snapshot endpoint | `GET /api/v1/attendance/location-snapshots` (admin, paginated by employee+date) |
| Auth pattern | `getAuthUser` + `assertRole('admin')` on backend; portal layout redirects unauthenticated |
| Admin UI framework | `'use client'` + SWR + `apiFetch` + `AdminLayout` + Tailwind + lucide-react |

**Map decision:** No library installed → list/table MVP only. Map view deferred to Phase 17.06. Recommended library: `pigeon-maps` (pure React, OpenStreetMap tiles, no API key required, no CDN).

---

## Phase B — Backend API

### `GET /api/v1/attendance/remote-active-locations`

**File:** `apps/admin/src/app/api/v1/attendance/remote-active-locations/route.ts`

- Admin JWT + `assertRole('admin')` required
- No query params — always returns all currently active remote employees
- Returns: `{ locations: ActiveRemoteLocation[], total: number }`

**File:** `apps/admin/src/services/RemoteLocationsService.ts`

Algorithm:
1. Find all `AttendanceSession` where `isActive: true, isRemote: true`
2. Batch-load `User` docs for employee name, department, designation
3. Aggregate latest `LocationSnapshot` per session (single pipeline, not N+1)
4. Compute freshness: `capturedAt` within 75 min → `"fresh"`, older → `"stale"`, no snapshot → `"noSnapshot"`
5. Sort by `checkInTimestamp` descending

### Response shape

```json
{
  "sessionId": "...",
  "employeeCode": "EMP4773",
  "firstName": "Sarvesh",
  "lastName": "Sawant",
  "department": "Developer",
  "designation": "Software Developer",
  "remoteSource": "employeeOverride",
  "checkInTimestamp": "2026-07-11T16:23:10.165Z",
  "checkInAddress": "Dombivli East, Thane",
  "latestSnapshot": {
    "latitude": 19.2019462,
    "longitude": 73.0866379,
    "accuracy": 33.4,
    "capturedAt": "2026-07-11T16:23:20.138Z",
    "address": "Dombivli East, Thane",
    "geocodingStatus": "success"
  },
  "freshness": "fresh"
}
```

### Freshness thresholds

| Value | Meaning |
|---|---|
| `fresh` | Latest snapshot within 75 minutes |
| `stale` | Latest snapshot older than 75 minutes |
| `noSnapshot` | Active remote session but no snapshot received yet |

75 minutes chosen to cover the 60-minute snapshot interval plus 15-minute grace.

---

## Phase C — Admin List Page

**File:** `apps/admin/src/app/(portal)/attendance/remote-locations/page.tsx`

**Route:** `/attendance/remote-locations`

### Features

- Linked from Attendance page sub-nav (Daily / Weekly / Monthly / **Remote** tabs)
- Auto-refresh every 60 seconds via SWR `refreshInterval`
- Manual refresh button
- Table columns: Employee, Source badge, Checked In (time + check-in address), Last Known Location (address or coords + accuracy), Last Update (relative time), Status chip
- Empty state: "No active remote employees" with explanation
- Map deferred notice banner with `pigeon-maps` recommendation

### Freshness chips

| Status | Color | Icon |
|---|---|---|
| Live | Green | Wifi |
| Stale | Amber | Clock |
| No signal | Gray | WifiOff |

### Remote source badges

| Value | Label | Color |
|---|---|---|
| `employeeOverride` | Field Override | Purple |
| `workAwayApproval` | Approved WFH | Indigo |

---

## Phase D — Map (Phase 17.06 — COMPLETE)

**Library:** `pigeon-maps` v0.22.1 — pure React, OpenStreetMap tiles, no API key, no SSR.

**File:** `apps/admin/src/components/maps/RemoteLocationMap.tsx`

**Integrated via:** `next/dynamic` with `ssr: false` in `/attendance/remote-locations/page.tsx`

### Marker colors

| Freshness | Color | Hex |
|---|---|---|
| `fresh` | Green | `#16a34a` |
| `stale` | Amber | `#d97706` |
| `noSnapshot` | Not plotted | — |

### Popup card (click marker)
- Employee name + initials avatar + code + department
- Designation, remote source badge (Approved WFH / Field Override)
- Check-in time, check-in address
- Last update (relative), current address or coords, accuracy

### Map centering
- Average lat/lng of all employees with snapshots; zoom 13 for single, 10 for multiple
- Falls back to India center (20.59, 78.96) / zoom 5 if no snapshots

### Legend
- Green dot = Live, Amber dot = Stale
- Overlaid bottom-left via `position: absolute`

### Empty overlay
- If `mappable.length === 0`, shows "No location snapshots yet" overlay on map tile

---

## Security / Access Control

| Layer | Control |
|---|---|
| API route | `getAuthUser` + `assertRole('admin')` — 401/403 if not admin |
| Frontend route | Portal layout redirects to `/login` if unauthenticated (307) |
| Data scope | Only returns sessions where `isActive: true, isRemote: true` — no checked-out employees |
| Employee data | Only name, department, designation, employeeCode — no PII beyond what admin sees elsewhere |
| Location data | Admin-only endpoint — employees cannot access other employees' locations |

---

## Files Modified / Created

| File | Change |
|---|---|
| `apps/admin/src/services/RemoteLocationsService.ts` | New — active remote locations with aggregated latest snapshot |
| `apps/admin/src/app/api/v1/attendance/remote-active-locations/route.ts` | New — GET admin-only endpoint |
| `apps/admin/src/app/(portal)/attendance/remote-locations/page.tsx` | New — admin list page |
| `apps/admin/src/app/(portal)/attendance/page.tsx` | Added "Remote" tab to sub-nav |
| `apps/admin/src/components/maps/RemoteLocationMap.tsx` | New — pigeon-maps component with markers + popup + legend |
| `apps/admin/package.json` | Added `pigeon-maps: ^0.22.1` |
| `docs/82-admin-active-remote-location-map.md` | This document |

---

## Phase 17.06 Runtime Smoke Test Results

**Test: Sat 11 Jul 2026, ~22:24 IST**

| Verification | Expected | Result |
|---|---|---|
| Remote check-in (geofence at Churchgate, phone at Dombivli) | `isRemote=true`, `remoteSource=employeeOverride` | ✓ Confirmed |
| `/remote-active-locations` after check-in | `total:1`, all fields | ✓ `total:1`, `freshness: fresh`, snapshot coords present |
| Map page loads | Map renders with OSM tiles | ✓ pigeon-maps renders correctly |
| Green marker visible | Marker at snapshot coords | ✓ Marker at 19.2019475, 73.0866409 |
| Checkout → marker disappears | `total:0` | ✓ Confirmed immediately |
| Geofence restored | `lat=19.201,lng=73.086,r=200m` | ✓ API confirmed |
| Employee bypass disabled | `allowOutsideGeofence=false` | ✓ Confirmed |

---

## Phase 17.05 Runtime Smoke Test Results

**Test: Sat 11 Jul 2026, ~21:53 IST**

| Verification | Expected | Result |
|---|---|---|
| Check-in remotely | `isRemote=true`, session created | ✓ Session at 21:53 |
| `GET /remote-active-locations` returns employee | 1 result | ✓ `total:1`, all fields present |
| `freshness` = `"fresh"` | Snapshot within 75 min | ✓ Confirmed |
| `checkInAddress` in response | `"Dombivli East, Thane"` | ✓ Confirmed |
| `latestSnapshot.address` in response | `"Dombivli East, Thane"` | ✓ Confirmed |
| `latestSnapshot.geocodingStatus` | `"success"` | ✓ Confirmed |
| Admin page route 307 when unauthenticated | Redirects to login | ✓ Confirmed |
| Checkout → employee removed from list | `total:0`, `locations:[]` | ✓ Confirmed immediately |
| Settings restored | `lat=19.201,lng=73.086,r=200m`, `allowOutsideGeofence=false` | ✓ API confirmed |

---

## Static / Build Results

| Check | Result |
|---|---|
| `tsc --noEmit` (Phase 17.05) | PASS — 0 errors |
| `tsc --noEmit` (Phase 17.06) | PASS — 0 errors |

---

## Deferred

| Item | Reason |
|---|---|
| Route trails / history path | Requires snapshot history per session; Phase 17.07+ |
| Background tracking | Requires Android foreground service; Phase 17.08+ |
| Snapshot frequency config | Admin-configurable interval; deferred |
| Payroll | Out of scope |
