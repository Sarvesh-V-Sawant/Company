# Phase 17.04 — Reverse Geocoding and Address Labels

**Date:** 2026-07-11
**Scope:** Backend-only reverse geocoding at check-in and location snapshot; mobile displays address in session cards
**Rules:** No secrets printed. No commits/pushes/deploys. No admin map. No payroll.

---

## Phase A — Audit Findings

| Area | Finding |
|---|---|
| Geocoding packages (admin) | None installed |
| Geocoding packages (mobile) | None (mobile never calls provider directly) |
| `GOOGLE_MAPS_API_KEY` in `.env.example` | Not present |
| Geocoding code in `apps/admin/src/` | None |
| `address` field in `AttendanceSession` | None |
| `address` field in `LocationSnapshot` | None |

**Decision:** Use Nominatim (OpenStreetMap) as default geocoder — free, no API key, no npm package required (uses Node's built-in `fetch`). Google Maps available as optional upgrade via env vars.

---

## Phase B — GeocodingService

**File:** `apps/admin/src/services/GeocodingService.ts`

```typescript
export type GeocodingStatus = 'success' | 'failed' | 'disabled';
export interface GeocodingResult {
  address: string | null;
  geocodingStatus: GeocodingStatus;
  geocodingProvider: string | null;
}
```

### Provider selection

| `GEOCODING_PROVIDER` | `GOOGLE_MAPS_API_KEY` | Behaviour |
|---|---|---|
| unset / `nominatim` | — | Nominatim (free, default) |
| `google` | set | Google Maps Geocoding API |
| `google` | unset | Falls back to Nominatim |
| `disabled` | — | Returns `{ address: null, geocodingStatus: 'disabled' }` |

### Nominatim address format

Builds short address: `road, suburb/city, state` from `address` object in response.
Falls back to `display_name` if structured fields missing.
User-Agent header: `Genesis-HRMS/1.0` (required by Nominatim ToS).

### Safety

- 5-second `AbortController` timeout on every fetch
- `reverseGeocode()` never throws — returns `'failed'` result on any error
- Fire-and-forget pattern at call sites (never blocks primary operation)

---

## Phase C — Model Updates

### `AttendanceSession.ts` — `ICheckInData` and `CheckInSchema`

Added optional fields:
```typescript
address?: string | null;      // reverse geocoded address
geocodingStatus?: string;     // 'success' | 'failed' | 'disabled'
```

### `LocationSnapshot.ts` — `ILocationSnapshot` and `LocationSnapshotSchema`

Added optional fields:
```typescript
address?: string | null;
geocodingStatus?: string;
geocodingProvider?: string | null;
```

Both use `default: null` in Mongoose schema — backward compatible with existing documents.

---

## Phase D — Integration

### Check-In (`AttendanceService.checkIn`)

After transaction commits and session is created, fire-and-forget geocoding:

```typescript
const sessionIdForGeo = sessionDoc._id.toHexString();
GeocodingService.reverseGeocode(input.latitude, input.longitude)
  .then((geo) => AttendanceSession.findByIdAndUpdate(sessionIdForGeo, {
    $set: { 'checkIn.address': geo.address, 'checkIn.geocodingStatus': geo.geocodingStatus },
  }))
  .catch(() => {});
```

The check-in response returns immediately. Address arrives in DB within ~1–2 seconds (Nominatim) and is visible on next `getStatus()` poll.

### Location Snapshot (`LocationSnapshotService.create`)

After snapshot document created, fire-and-forget:

```typescript
GeocodingService.reverseGeocode(input.latitude, input.longitude)
  .then((geo) => LocationSnapshot.findByIdAndUpdate(snapshotId, {
    $set: { address: geo.address, geocodingStatus: geo.geocodingStatus, geocodingProvider: geo.geocodingProvider },
  }))
  .catch(() => {});
```

---

## Phase E — API Responses

### `AttendanceService.formatSession()`

Added `checkInAddress: s.checkIn.address ?? null` to every session in history/weekly/monthly endpoints.

### `AttendanceService.getStatus()`

- `todaySummary.sessions[].checkInAddress` — added
- `currentSession.checkInAddress` — added

### `LocationSnapshotService.list()`

Added `address`, `geocodingStatus`, `geocodingProvider` to each snapshot in paginated response.

---

## Phase F — Mobile UI

### `attendance.dart`

`AttendanceSession` class now has:
```dart
final String? checkInAddress;
```
Parsed from `json['checkInAddress']`.

### `attendance_remote_source.dart`

`getToday()` sessions mapping now passes `'checkInAddress': m['checkInAddress']`.

### `daily_detail_screen.dart`

In session card, location row now shows:
- **If `checkInAddress` not null:** displays address string
- **If null:** falls back to `lat, lng` coordinates (unchanged behaviour)

### `home_screen.dart`

In `_StatusCard` (checked-in arm), below "Since HH:MM":
- Shows `checkInAddress` of the active session with a small location icon
- Hidden if address is null (no "Address unavailable" clutter in home screen — only DailyDetail shows fallback)

---

## Phase G — Admin

`GET /api/v1/attendance/location-snapshots` already returns `address`, `geocodingStatus`, `geocodingProvider` via updated `LocationSnapshotService.list()`. No admin map view — deferred to Phase 17.05.

---

## Phase H — `.env.example`

Added geocoding section:
```
# GEOCODING_PROVIDER=nominatim   # nominatim (default, free, no key needed) | google | disabled
# GOOGLE_MAPS_API_KEY=           # only required when GEOCODING_PROVIDER=google
```

---

## Files Modified

| File | Change |
|---|---|
| `apps/admin/src/services/GeocodingService.ts` | New — Nominatim + Google geocoder |
| `apps/admin/src/models/AttendanceSession.ts` | `ICheckInData` + `CheckInSchema`: added `address`, `geocodingStatus`, `geocodingProvider` |
| `apps/admin/src/models/LocationSnapshot.ts` | `ILocationSnapshot` + schema: added `address`, `geocodingStatus`, `geocodingProvider` |
| `apps/admin/src/services/AttendanceService.ts` | Import GeocodingService; fire-and-forget in `checkIn()`; address in `formatSession()`, `getStatus()` sessions + currentSession |
| `apps/admin/src/services/LocationSnapshotService.ts` | Import GeocodingService; fire-and-forget after create; address in `list()` output |
| `apps/admin/.env.example` | Added geocoding env var block |
| `apps/mobile/lib/core/models/attendance.dart` | `AttendanceSession.checkInAddress` field + fromJson |
| `apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart` | `getToday()` passes `checkInAddress` |
| `apps/mobile/lib/features/attendance/presentation/screens/daily_detail_screen.dart` | Session card shows address or coordinate fallback |
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | Active session card shows address when available |
| `docs/81-reverse-geocoding-address-labels.md` | This document |

---

## Static / Build Results

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS — 0 errors |
| `flutter analyze --no-fatal-infos` | PASS — No issues |
| `flutter build apk --debug` | PASS — `build/app/outputs/flutter-apk/app-debug.apk` |

---

## Runtime Smoke Test Results

**Test: Sat 11 Jul 2026, ~21:34 IST**
- Provider: Nominatim (default — no `GEOCODING_PROVIDER` set in `.env.local`)
- Geofence: `lat=0,lng=0,radius=100m` (device ~8000km outside)
- `allowOutsideGeofence=true` for test user

| Verification | Expected | Result |
|---|---|---|
| Check-in succeeds with `isRemote=true` | Session created | ✓ Session 2 created at 21:34 |
| Geocoding fires after check-in | Address stored asynchronously | ✓ `"Dombivli East, Thane"` in DB |
| `geocodingStatus` on session | `'success'` | ✓ confirmed via location-snapshots endpoint |
| `geocodingProvider` on session | `'nominatim'` | ✓ confirmed |
| Home screen shows address | "Dombivli East, Thane" below "Since 21:34" | ✓ UIAutomator content-desc confirmed |
| Remote tracking notice present | Visible while checked in | ✓ In content-desc |
| Checkout succeeds | No crash, no address block | ✓ Session Out: 21:37, UI back to "CHECK IN AGAIN" |
| Remote tracking notice gone after checkout | Not visible | ✓ Not in post-checkout content-desc |
| DailyDetail Session 2 shows address | "Dombivli East, Thane" | ✓ UIAutomator confirmed |
| DailyDetail Session 1 (old, no address) shows coords | "19.20195, 73.08664" | ✓ Coordinate fallback working |
| Location snapshot address stored | address + status + provider | ✓ `total:2`, both geocoded |
| Settings restored | `lat=19.201,lng=73.086,r=200m`, `allowOutsideGeofence=false` | ✓ API confirmed |

**Checkout address**: Not implemented — GPS stored as (0, 0) at checkout per API spec §5.2. Geocoding (0,0) returns mid-ocean result; excluded by design.

---

## Deferred

| Item | Reason |
|---|---|
| Admin map view of location snapshots | Phase 17.05 |
| Geocoding cache / deduplication | Low priority — check-ins infrequent, Nominatim rate limit not a concern at HRMS scale |
| Checkout address | API spec §5.2 — GPS not collected at checkout |
| Address search / filtering in admin list | Out of scope |
