# Phase 15.38 — Settings Current Location UX Fix + Mobile Full UAT

**Date:** 2026-07-03  
**Phase:** 15.38  
**Status:** COMPLETE

---

## Phase A — Environment Precheck

| Check | Result |
|-------|--------|
| Backend running on port 3000 | PASS — `{"status":"ok","db":"ok","redis":"ok"}` |
| `/health` healthy | PASS |
| Admin login | PASS (password corrected — see below) |
| `/settings` page reachable after login | PASS — redirects to `/login` when unauthenticated; serves page when authenticated |
| Android device connected | PASS — CPH2721 `700dd050` |
| `adb reverse tcp:3000 tcp:3000` | PASS — `3000` |
| Flutter sees device | PASS — `CPH2721 • 700dd050 • android-arm64 • Android 16 (API 36)` |
| Mobile app launches | PASS — PID 27996 confirmed |
| `.env.local` exists and not tracked | PASS — `not tracked (good)` |

### Admin password correction

Login with `Genesis@Test2026!` returned AUTH_001. Seed script (`scripts/seed-admin.ts:14`) uses env var `SEED_ADMIN_PASSWORD` with fallback `Admin@123456`. Login with `Admin@123456` succeeded. The `Genesis@Test2026!` password in prior phases was incorrect.

---

## Part 1 — Settings Geofence UX Fix

### Problem (runtime-verified before code change)

`GET /api/v1/settings` with admin JWT returned current geofence:

```json
{ "lat": 19.076, "lng": 72.8777, "radiusMeters": 200, "enabled": true }
```

`SettingsGeofenceForm.tsx` showed two `<Input type="number">` fields for latitude and longitude with no auto-fill capability. Admin had to type coordinates manually — error-prone for geofence setup.

### Fix

**File changed:** `apps/admin/src/components/forms/SettingsGeofenceForm.tsx`

Added:
1. `setValue` from `useForm` destructuring
2. `locating` state (`boolean`)
3. `GEO_ERRORS` map for user-friendly geolocation error messages (codes 1/2/3)
4. `handleUseCurrentLocation()` — calls `navigator.geolocation.getCurrentPosition()` with 10s timeout, `maximumAge: 0`
5. On success: `setValue('lat', pos.coords.latitude, { shouldValidate: true })` and `setValue('lng', ...)` — fields update and validate immediately; admin can still edit manually afterward
6. On error: `toast.error(GEO_ERRORS[err.code])` per error code; fallback for unknown codes
7. Unsupported browser: `toast.error('Your browser does not support geolocation')` before any async call
8. "Use Current Location" button rendered as `variant="outline" size="sm"` above the lat/lng grid when geofencing is enabled
9. Button shows `loading` spinner + "Detecting…" label while position is being fetched

### Error handling

| Condition | Message shown to admin |
|-----------|----------------------|
| Browser has no geolocation support | "Your browser does not support geolocation" |
| Permission denied (code 1) | "Location permission denied. Allow location access in your browser and try again." |
| Location unavailable (code 2) | "Location unavailable. Check your network or device GPS." |
| Timeout (code 3) | "Location request timed out. Try again." |
| Unknown code | "Could not retrieve location" |
| Success | "Location detected (±N m accuracy)" |

### TypeScript check

```
npx tsc --noEmit --skipLibCheck → no errors
```

### Backend contract unchanged

`PATCH /api/v1/settings` with `{ geofence: { enabled, lat, lng, radiusMeters } }` — backend schema unchanged. No backend modification needed.

---

## Part 2 — Mobile Full UAT

Device: CPH2721 (`700dd050`), Android 16 (API 36)  
User: EMP4773 `saru.sawant03@gmail.com`, role: `employee`  
ADB reverse tunnel: `adb reverse tcp:3000 tcp:3000`

### Screen 1 — Home

```
GET /api/v1/attendance/status → HTTP 200
body: {isCheckedIn: false, todayDateString: 2026-07-03, currentSession: null,
       todaySummary: {totalMinutes: 0, status: absent, sessions: []}}
GET /api/v1/notifications → HTTP 200
body: {data: [], pagination: {page:1, limit:30, total:0, totalPages:0}}
```

Status: **PASS** — no 403, no DioException, no crash

### Screen 2 — Attendance

```
GET /api/v1/attendance/history → HTTP 200
body: {data: [], meta: {page:1, limit:30, total:0, totalPages:0}}
```

Status: **PASS** — employee-safe endpoint, empty list renders correctly

### Screen 3 — Leave

```
GET /api/v1/leaves/balance → HTTP 200
body: {data: {paidLeave: {currentYear:7, total:7}, sickLeave: {currentYear:4.5, total:4.5},
              casualLeave: {currentYear:3.5, total:3.5}, asOf: "2026-07-02T21:02:45.468Z"}}
```

Status: **PASS** — Map parsed correctly, no type cast crash

### Screen 4 — Notifications

```
GET /api/v1/notifications → HTTP 200
body: {data: [], pagination: {page:1, limit:30, total:0, totalPages:0}}
```

Runtime evidence: confirmed in boot logcat (PID 27996). Source `NotificationsRemoteSource.getAll()` casts `data` as `List<dynamic>` — correct for the response shape.

Status: **PASS**

### Screen 5 — Profile

No additional API calls on navigation. `ProfileScreen` reads `ref.watch(authProvider).user` — loaded from `/api/v1/auth/me → HTTP 200` at boot. Displays `employeeId`, `fullName`, `email`, `designation`, `department`, `phone` — all available in the `/me` response.

```
GET /api/v1/auth/me → HTTP 200
body: {id: 6a415e76abc350dc4e6080e3, employeeId: EMP4773, email: saru.sawant03@gmail.com,
       firstName: Sarvesh, lastName: Sawant, role: employee, ...}
```

Status: **PASS**

### Error check

No `Error`, `Exception`, or `FATAL` in logcat for any screen navigation.

---

## UAT Checklist

| Check | Result |
|-------|--------|
| Login with approved device succeeds | PASS |
| Home loads, no raw DioException | PASS |
| Attendance loads, no raw DioException | PASS |
| Leave Balance loads, no type cast crash | PASS |
| Leave History loads | PASS |
| Notifications loads | PASS |
| Profile loads, displays employee data | PASS |
| No crashes across all 5 screens | PASS |

---

## Files Changed in Phase 15.38

| File | Change |
|------|--------|
| `apps/admin/src/components/forms/SettingsGeofenceForm.tsx` | Added "Use Current Location" geolocation button with full error handling |

No mobile files changed (Phase 15.37 fixes sufficient).

---

## Known Open Items (post-Phase 15.38, out of scope)

- P0: Secrets not rotated (git history contamination + unrotated keys)
- Production verification on Vercel incomplete
- Final regression gates not rerun
- Admin password `Genesis@Test2026!` used in some prior documentation is incorrect; actual seed password is `Admin@123456`
- ADB reverse tunnel lost on USB reconnect — must re-run `adb reverse tcp:3000 tcp:3000` after reconnect
