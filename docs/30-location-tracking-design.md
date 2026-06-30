# Phase 16.0 — Employee Location Tracking: Capability Verification & Architecture Design

**Date:** 2026-06-26  
**Type:** Read-only verification + architecture proposal — no code modified  
**Status:** DESIGN COMPLETE — awaiting implementation approval

---

## Part 1 — Current Capability Assessment

### What exists today

| Capability | Status | Evidence |
|---|---|---|
| One-shot GPS capture at check-in | ✅ Implemented | `home_screen.dart:71` — `Geolocator.getCurrentPosition(accuracy: high)` |
| Office geofence configuration (admin settings) | ✅ Implemented | `CompanySettings.geoFence` — lat/lng/radius/isEnabled |
| Server-side geofence validation at check-in | ✅ Implemented | `AttendanceSession.checkIn.isWithinGeoFence` written by `AttendanceService` |
| `geolocator` Flutter package | ✅ Present | `pubspec.yaml:17` — `geolocator: ^13.0.0` |
| Android fine/coarse location permission | ✅ Present | `AndroidManifest.xml:3-4` |
| iOS location-when-in-use description | ✅ Present | `Info.plist:48` |
| iOS always-and-when-in-use description | ✅ Present | `Info.plist:50` |
| **Periodic GPS capture while checked in** | ❌ Not present | No timer, no WorkManager, no background isolate |
| **Background location service (Android)** | ❌ Not present | No foreground service, no WorkManager, no `FOREGROUND_SERVICE` permission |
| **Background location mode (iOS)** | ❌ Not present | No `UIBackgroundModes: [location]` in Info.plist |
| **Background location permission (Android)** | ❌ Not present | No `ACCESS_BACKGROUND_LOCATION` in manifest |
| **LocationPing / LocationHistory DB collection** | ❌ Not present | No matching model in `apps/admin/src/models/` (20 models audited) |
| **API — upload location ping** | ❌ Not present | No route under `api/v1/attendance/location` or similar |
| **API — current employee location** | ❌ Not present | No route for live location retrieval |
| **API — location history / route** | ❌ Not present | No route for historical location retrieval |
| **Admin portal — employee live location** | ❌ Not present | No map component imported anywhere in admin app |
| **Admin portal — route playback** | ❌ Not present | No map page, no leaflet/mapbox dependency |
| **CompanySettings — tracking toggle/interval/retention** | ❌ Not present | `ICompanySettings` has no tracking fields |

### Conclusion

**Continuous employee location tracking does not exist anywhere in the codebase.** The system captures GPS exactly once per attendance check-in for geofence validation. All infrastructure for periodic background tracking, location history storage, retrieval APIs, and map-based admin UI is absent and must be built from scratch.

---

## Part 2 — Architecture Proposal

### 2.1 Business Flow (target state)

```
Employee checks in
       │
       ▼
Server validates geofence
       │
       ├─ Within geofence ──────────────────────► No tracking. Normal session.
       │
       └─ Outside geofence
               │
               ▼
         Check-in response: { requiresTracking: true, trackingIntervalMinutes: 30 }
               │
               ▼
         Mobile starts background WorkManager job (Android)
         Mobile registers BGTaskScheduler task  (iOS)
               │
               ▼ every 30 min while session active
         GPS fix → POST /api/v1/attendance/location
         Server stores LocationPing → { userId, sessionId, lat, lng, accuracy, timestamp }
               │
               ▼
         Employee checks out
               │
               ▼
         Mobile cancels WorkManager / BGTask
         Server marks session checkoutAt
               │
               ▼
         Admin views employee route on map
         GET /api/v1/attendance/[sessionId]/location → polyline overlay
```

### 2.2 Tracking Trigger Decision

**Interpretation of "if outside geofence, tracking begins":** Tracking is triggered at check-in time based on the geofence evaluation already performed by the server. If the employee checked in outside the office perimeter, tracking begins for the duration of that session. Tracking does not reactively start/stop based on mid-day geofence crossings (that is a separate real-time geofence notification feature).

**Why this interpretation:** The server already computes `isWithinGeoFence` at check-in. The check-in response is the natural signaling channel. This avoids requiring continuous geofence monitoring in the background (which would mandate a persistent foreground service even for in-office employees, defeating the battery efficiency goal).

---

## Part 3 — Database Schema

### 3.1 New collection: `locationpings`

```typescript
// apps/admin/src/models/LocationPing.ts

interface ILocationPing extends Document {
  userId:              ObjectId;   // ref: User (_id)
  attendanceSessionId: ObjectId;   // ref: AttendanceSession
  latitude:            number;
  longitude:           number;
  accuracy:            number;     // metres
  distanceFromOffice:  number;     // metres, computed server-side
  timestamp:           Date;       // client-reported (validated against server time)
  batteryLevel:        number | null;  // 0-100, optional
  source:              'periodic' | 'checkout_final';
  createdAt:           Date;
}

// Indexes:
// { attendanceSessionId: 1, timestamp: 1 }  — primary query path
// { userId: 1, timestamp: -1 }              — employee history queries
// { createdAt: 1 }, expireAfterSeconds: computed from retentionDays  — TTL auto-purge
```

### 3.2 CompanySettings additions

New sub-document on the singleton `company-settings` document:

```typescript
locationTracking: {
  enabled:                   boolean;  // global on/off (default: false)
  trackOutsideGeofenceOnly:  boolean;  // default: true
  intervalMinutes:           number;   // default: 30, min: 5, max: 120
  retentionDays:             number;   // default: 90, min: 7, max: 365
}
```

When `enabled: false`, the check-in response sets `requiresTracking: false` regardless of geofence status.

### 3.3 AttendanceSession — no schema change required

`checkIn.isWithinGeoFence` already stored. No new fields needed; the `requiresTracking` flag is derived at response time from `isWithinGeoFence && settings.locationTracking.enabled && settings.locationTracking.trackOutsideGeofenceOnly`.

---

## Part 4 — API Design

### 4.1 Upload location ping (employee → server)

```
POST /api/v1/attendance/location
Auth: employee JWT
Header: X-Device-Fingerprint (existing pattern)

Request body:
{
  "latitude":     number,        // -90 to 90
  "longitude":    number,        // -180 to 180
  "accuracy":     number,        // metres ≥ 0
  "timestamp":    string,        // ISO 8601, validated within ±5 min of server time
  "batteryLevel": number | null  // 0-100, optional
}

Response 201:
{ "success": true, "data": { "id": "...", "recorded": true } }

Response 400: timestamp too old/future, validation failure
Response 403: no active attendance session for this employee
Response 409: ping received for already-closed session
```

**Server-side logic:**
1. Verify active `AttendanceSession` exists for `userId` (status: open, no `checkOut`)
2. Compute `distanceFromOffice` from company geofence coordinates
3. Validate timestamp within `±checkinTimestampWindowMinutes` (reuse existing config) — prevents replaying stale pings
4. Insert `LocationPing` document
5. Emit audit log entry

### 4.2 Get location history for a session (admin)

```
GET /api/v1/attendance/[sessionId]/location
Auth: admin JWT

Response 200:
{
  "success": true,
  "data": {
    "sessionId": "...",
    "employee": { "id": "...", "firstName": "...", "lastName": "...", "employeeId": "EMP001" },
    "checkInAt": "...",
    "checkOutAt": "..." | null,
    "checkInLocation": { "latitude": ..., "longitude": ..., "isWithinGeoFence": ... },
    "pings": [
      { "id": "...", "latitude": ..., "longitude": ..., "accuracy": ..., "distanceFromOffice": ..., "timestamp": "...", "batteryLevel": null }
    ],
    "totalPings": 4
  }
}
```

### 4.3 Get employee's current (last known) location (admin)

```
GET /api/v1/employees/[id]/location/current
Auth: admin JWT

Response 200:
{
  "success": true,
  "data": {
    "hasActiveSession": true,
    "sessionId": "...",
    "isTracking": true,
    "lastPing": {
      "latitude": ..., "longitude": ..., "accuracy": ...,
      "timestamp": "...", "minutesAgo": 12
    } | null
  }
}

Response 200 (no active session):
{ "success": true, "data": { "hasActiveSession": false, "isTracking": false, "lastPing": null } }
```

### 4.4 Settings — location tracking config (admin)

```
GET  /api/v1/settings/location-tracking   → returns locationTracking sub-document
PATCH /api/v1/settings/location-tracking  → updates locationTracking fields (partial)
```

### 4.5 Check-in response change

`AttendanceService.checkIn()` return value gains two new fields:

```typescript
{
  sessionId: string,
  checkInAt: string,
  isWithinGeoFence: boolean,
  // NEW:
  requiresTracking:       boolean,
  trackingIntervalMinutes: number   // always present; mobile uses only if requiresTracking=true
}
```

---

## Part 5 — Mobile Changes

### 5.1 New Flutter package dependencies

```yaml
# pubspec.yaml additions
workmanager: ^0.5.2        # Background task scheduling (Android WorkManager + iOS BGTaskScheduler)
connectivity_plus: ^6.0.0  # Network availability check before upload
shared_preferences: ^2.3.0 # Offline ping queue persistence (already likely present — verify)
```

### 5.2 Android manifest additions

```xml
<!-- apps/mobile/android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" /> <!-- verify present -->

<!-- Inside <application> tag: -->
<service
    android:name="androidx.work.impl.foreground.SystemForegroundService"
    android:foregroundServiceType="location"
    android:exported="false" />
```

**Android background location permission flow:** Android 11+ requires requesting `ACCESS_BACKGROUND_LOCATION` separately AFTER foreground permission is granted, via a dedicated rationale screen explaining why always-on is needed. The system then routes the user to the OS settings page; the app cannot show a standard dialog for this.

### 5.3 iOS Info.plist additions

```xml
<!-- apps/mobile/ios/Runner/Info.plist -->
<key>NSLocationAlwaysUsageDescription</key>
<string>Genesis Workforce needs background location access to track your attendance when you are outside the office.</string>

<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>processing</string>
</array>

<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.genesis.workforce.locationping</string>
</array>
```

**Note:** iOS does not expose `UIBackgroundModes: location` (continuous background location) without entitlement review from Apple. Instead, use `BGTaskScheduler` (fetch + processing) which is allowed for apps that don't stream live GPS. For a 30-minute periodic ping, this is the correct approach. Apple allows this without special review.

### 5.4 New Dart files

#### `lib/features/attendance/services/location_tracking_service.dart`

Responsibilities:
- `startTracking(intervalMinutes)` — registers WorkManager periodic task; stores `{ sessionId, apiBaseUrl, authToken }` in SharedPreferences for the background isolate
- `stopTracking()` — cancels WorkManager task; clears stored keys
- `executeBackgroundPing()` — called by WorkManager callback in background isolate:
  1. Read stored `{ sessionId, authToken }` from SharedPreferences
  2. Check if token still valid (JWT expiry); skip ping if expired
  3. Get GPS fix with `LocationAccuracy.medium`, 20s timeout
  4. Check connectivity; if offline, enqueue to local pending queue (max 10 entries)
  5. POST to `/api/v1/attendance/location`
  6. On success: flush any pending queued pings
  7. On failure: add to queue (will retry on next wake-up)

#### `lib/features/attendance/providers/tracking_provider.dart`

Thin Riverpod provider that wraps `LocationTrackingService`. Exposes:
- `isTracking: bool`
- `startTracking(intervalMinutes)`
- `stopTracking()`

#### WorkManager initialization (`lib/main.dart` or app bootstrap)

```dart
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task == 'locationPing') {
      await LocationTrackingService.executeBackgroundPing();
    }
    return Future.value(true);
  });
}

// In main():
Workmanager().initialize(callbackDispatcher, isInDebugMode: false);
```

### 5.5 home_screen.dart modifications

After successful check-in (inside `notifier.checkIn()` completion handler):
```dart
final result = await notifier.checkIn(...);
if (result.requiresTracking) {
  await ref.read(trackingProvider.notifier).startTracking(result.trackingIntervalMinutes);
}
```

After successful check-out:
```dart
await ref.read(trackingProvider.notifier).stopTracking();
```

On `app reconcile()` (app resume): if session is active and `requiresTracking` was set, verify WorkManager task is still registered (re-register if cancelled by OS).

---

## Part 6 — Admin Portal Changes

### 6.1 New npm dependency

```bash
npm install react-leaflet leaflet
npm install --save-dev @types/leaflet
```

**Why Leaflet over Google Maps / Mapbox:**
- No API key, no billing — Google Maps charges per map load
- OpenStreetMap tiles are free with attribution
- `react-leaflet` is lightweight (~40KB), well-maintained
- Polyline rendering for route display is first-class
- Circle overlay for geofence visualization is supported
- No CORS or token expiry issues in dev

### 6.2 New admin page — Employee Location

```
apps/admin/src/app/(portal)/employees/[id]/location/page.tsx
```

Accessible from the employee detail page as a "Location" tab or button. Shows:

1. **Map** (Leaflet) centered on last known location or office location:
   - Blue marker: office geofence center
   - Green circle: geofence radius
   - Red markers: each location ping (ordered by timestamp)
   - Polyline connecting pings in chronological order (route)
   - Orange marker (pulsing): most recent / current location
   - Popup on each ping marker: timestamp, accuracy, battery level, distance from office

2. **Session selector**: dropdown of recent sessions (last 30 days) with date labels

3. **Stats bar**: total pings, session duration, first/last ping time, % time inside geofence

4. **Export button** (future): download route as GeoJSON (out of scope for Phase 16)

### 6.3 Modified admin page — Attendance detail

```
apps/admin/src/app/(portal)/attendance/[id]/page.tsx
```

Add "View Route" button linking to the new employee location page pre-filtered to this session.

### 6.4 New admin page — Location Tracking Settings

Add `locationTracking` section to existing company settings page, or new dedicated page:

```
apps/admin/src/app/(portal)/settings/location-tracking/page.tsx
```

Fields:
- Enable/Disable location tracking toggle
- Tracking only when outside geofence (toggle, default on)
- Tracking interval: dropdown (5 / 10 / 15 / 30 / 60 min)
- Retention period: input (7–365 days, default 90)

---

## Part 7 — Background Service Design

### Android

**Mechanism: WorkManager PeriodicWorkRequest**

```
Interval: configurable (default 30 min)
Min interval: 15 min (Android OS floor)
Flexibility window: 5 min (allows OS to batch for battery)
Constraints: NetworkType.CONNECTED (don't wake device just to queue)
Survival: ✅ survives app kill, ✅ survives device reboot (WorkManager persists to Room DB)
Battery: Battery Doze compatible — WorkManager tasks run during Doze maintenance windows
```

**Why not foreground service:** A persistent foreground service with notification would drain battery continuously and intrude on the user experience for a feature that only needs 30-minute intervals. WorkManager is the Android-recommended pattern for deferrable periodic work.

**Android 12+ restriction:** Background location (`ACCESS_BACKGROUND_LOCATION`) requires explicit user grant via OS settings page. The app must show rationale before redirecting user. This is a UX consideration: the feature will silently not track if the user denies background permission. The mobile UI should surface a clear in-app message when `requiresTracking=true` but background permission is unavailable.

### iOS

**Mechanism: BGTaskScheduler (BGAppRefreshTask)**

```
Identifier: com.genesis.workforce.locationping
System schedules: Best-effort, approximately 30-min interval
Guarantee: None — iOS may delay up to several hours under low power mode
CPU budget: ~30 seconds per task execution
```

**iOS tracking accuracy vs. battery:** Use `kCLLocationAccuracyHundredMeters` for periodic pings (not `.best`). The 100m accuracy is sufficient for "is employee near office" at 30-min intervals and uses significantly less battery than high-precision fixes.

**iOS significant change fallback:** As a supplementary mechanism, `CLLocationManager.startMonitoringSignificantLocationChanges()` can be enabled when the session is active. This fires when the device moves ~500m and wakes the app briefly. Can be used to validate the employee hasn't left the work area without relying on exact scheduling. Optional enhancement; not required for MVP.

**iOS `NSLocationAlwaysUsageDescription` note:** Adding this key does not automatically request "always" permission. The app must call `requestAlwaysAuthorization()` at an appropriate moment with a rationale. Apple guidelines require this request to appear in context (not at app launch). Recommend triggering the request immediately after check-in when `requiresTracking=true`.

---

## Part 8 — Security Analysis

| Threat | Mitigation |
|---|---|
| Employee spoofs GPS coordinates (fake location) | Server computes `distanceFromOffice` independently; outlier pings (accuracy > threshold) are flagged. Cannot fully prevent GPS spoofing without device attestation (SafetyNet/Play Integrity). |
| Replay of old location pings | Validate `timestamp` within `±checkinTimestampWindowMinutes` of server time. Ping with timestamp older than 10 min rejected with 400. |
| Unauthorized location upload (non-employee) | Endpoint requires valid employee JWT. Verify `userId` has active `AttendanceSession` with `requiresTracking=true` state (to be stored on session). |
| Admin reads another company's employee locations | Single-tenant SaaS; all data under shared MongoDB — no tenant isolation issue. For future multi-tenant: add `companyId` to `LocationPing`. |
| Location data exfiltration via API | Admin-only endpoints. Rate limiting inherited from existing `rateLimiter` middleware. |
| Background token used after logout | WorkManager stores JWT in SharedPreferences. On logout, clear stored credentials and cancel WorkManager task. Add logout hook to `LocationTrackingService.stopTracking()`. |
| Stale session tracking (after session auto-close) | POST /attendance/location returns 409 if `AttendanceSession` is closed. Mobile receives 409, stops WorkManager task. |

---

## Part 9 — Privacy Analysis

1. **Data minimisation:** Only collect lat/lng/accuracy/timestamp. No street address resolution, no contact data, no app usage data captured during tracking.

2. **Purpose limitation:** Location pings stored in `locationpings` collection. Not used for payroll computation, leave calculation, or any non-attendance purpose.

3. **Transparency — mobile:** When `requiresTracking=true`, display a persistent in-app banner during the attendance session: "Your location is being tracked every 30 minutes because you checked in outside the office." Banner disappears on checkout.

4. **Employee consent:** Device registration already records informed consent at onboarding. Location tracking policy should be added to the employee onboarding text (seeds/settings update, not a code change).

5. **Retention:** TTL index on `LocationPing.createdAt` with `expireAfterSeconds = retentionDays × 86400`. MongoDB automatically purges old pings. Default 90 days.

6. **Access control:** Employee should be able to view their own location history (`GET /api/v1/attendance/[sessionId]/location` with employee JWT, scoped to own sessions). Admin can view any employee. Implemented via role check in route handler.

7. **Audit logging:** Every ping upload and admin location retrieval logged to existing `AuditLog` collection.

---

## Part 10 — Battery Impact

| Scenario | Impact |
|---|---|
| Employee in office (geofence), tracking disabled | Zero impact — `requiresTracking=false`, no WorkManager task registered |
| Employee outside geofence, 30-min interval | ~1-2% battery per hour — GPS fix ~15s every 30min + HTTP POST ~2s. Comparable to a background email sync. |
| iOS BGTask delayed (Doze/low power) | Battery impact is lower but pings may arrive up to 2h late — acceptable for route-history use case, not real-time |
| Pending offline queue flush (up to 10 pings) | One-time burst on reconnect — negligible |

**Optimisations:**
- Use `LocationAccuracy.medium` (not `.high`) for periodic pings — sufficient for 30-min interval tracking, ~60% less battery than `high` fixes
- WorkManager constraints: `NetworkType.CONNECTED` prevents waking radio from idle just to queue
- On checkout, cancel WorkManager immediately rather than waiting for next OS scheduling window

---

## Part 11 — Offline Behaviour

```
Mobile → no network
    │
    ▼
GPS fix acquired
    │
    ▼
POST fails (timeout / no connectivity)
    │
    ▼
Enqueue ping to SharedPreferences local queue (max 10 entries, FIFO drop oldest)
    │
    ▼ Network restored (connectivity_plus callback)
    │
    ▼
Flush queue: POST each pending ping in order
    │
    ├─ 201 received → remove from queue
    ├─ 409 (session closed) → discard all remaining queue entries, stop tracking
    └─ 4xx (other) → discard that ping, continue flushing
```

**Why max 10 entries:** 10 pings × 30 min = 5 hours offline buffer. Beyond 5 hours of offline, the session would likely be auto-closed by the server anyway. Prevents unbounded SharedPreferences growth.

---

## Part 12 — Edge Cases

| Case | Handling |
|---|---|
| Employee force-kills app (Android) | WorkManager task registered at OS level — survives app kill. Next ping fires at next 30-min window even if app is closed. |
| Device reboot mid-session | WorkManager automatically re-registers periodic work after reboot. No extra `RECEIVE_BOOT_COMPLETED` permission needed for WorkManager-based tasks. |
| Session auto-closed at midnight (existing cron job) | First POST after auto-close returns 409; mobile cancels WorkManager and clears stored session state. |
| Check-in response lost (network error) | Mobile does not start tracking (safe default). Employee can tap "Refresh" which calls `GET /api/v1/attendance/today` — add `requiresTracking` to that response too. |
| Geofence disabled mid-session by admin | Server evaluates `requiresTracking` at check-in time only. Mid-session setting changes do not retroactively start/stop tracking for active sessions. |
| Company disables location tracking via settings | Next periodic ping returns 403/400; mobile catches error, stops WorkManager. Alternatively: include `trackingActive: boolean` in ping response to signal stop. |
| Two open sessions (edge case: bug) | POST validates one active session per user (`AttendanceSession.find({ userId, status: 'open' }).count() === 1`). Duplicate sessions blocked at check-in level (existing logic). |
| Location permission revoked after session start | iOS: BGTask runs but `CLLocationManager` returns error → ping skipped, log locally. Android: WorkManager task runs, `geolocator` throws `PermissionDeniedException` → ping skipped. In both cases, gap in location history is recorded but no crash or retry loop. |
| Employee in tunnel / underground (no GPS) | Same as permission revoked — accuracy exceeds threshold or fix times out. Skip ping for that interval. The route will have a gap; this is expected behaviour. |

---

## Part 13 — Testing Strategy

### Unit Tests (Jest — existing pattern)

1. **`LocationService.test.ts`** — mock `LocationPing.create`, test distanceFromOffice calculation, timestamp validation, session ownership check
2. **`SettingsService.test.ts`** — extend existing tests to cover `updateLocationTracking()`
3. **`AttendanceService.test.ts`** — extend existing check-in test to verify `requiresTracking` computation in response

### Integration / E2E Tests (existing runtime verification pattern)

Flows to verify:
- F1: Admin enables location tracking via PATCH `/settings/location-tracking`
- F2: Employee checks in outside geofence → `requiresTracking: true` in response
- F3: POST `/attendance/location` × 3 with 30-min gaps → 3 pings in `locationpings` collection
- F4: GET `/attendance/[sessionId]/location` → returns all 3 pings in order
- F5: Employee checks out → POST location returns 409
- F6: Admin views GET `/employees/[id]/location/current` → returns last ping

### Mobile Tests (Flutter)

- `location_tracking_service_test.dart` — mock WorkManager, mock geolocator, verify task registration/cancellation
- `home_screen_widget_test.dart` — extend existing to verify tracking starts/stops on check-in/checkout responses

### Admin Portal Tests

- Leaflet map renders without console errors (smoke test)
- `GET /attendance/[sessionId]/location` with no pings returns empty `pings: []` without crash
- Map handles single ping (no polyline, just marker)

---

## Part 14 — Rollout Strategy

**Phase 16.1 — Backend only** (no mobile or UI changes):
- `LocationPing` model
- `CompanySettings.locationTracking` sub-document
- `LocationService` with all business logic
- All new API routes
- `AttendanceService.checkIn()` updated to return `requiresTracking`
- Unit tests
- Feature off by default (`enabled: false` in seed)

**Phase 16.2 — Mobile (Android first):**
- `workmanager` + `connectivity_plus` packages
- Android manifest permissions
- `LocationTrackingService` Dart class
- WorkManager callback dispatcher
- `home_screen.dart` integration
- Manual QA: test on Android 12+ device with background permission

**Phase 16.3 — Mobile (iOS):**
- `Info.plist` additions
- BGTaskScheduler integration in `AppDelegate.swift`
- iOS-specific test on real device (BGTaskScheduler does not fire in simulator)

**Phase 16.4 — Admin Portal:**
- `react-leaflet` + `leaflet` npm packages
- Employee location page
- Location tracking settings page
- Attendance detail "View Route" button

**Why sequential:** Each phase can be shipped and tested independently. Backend API is usable from Postman before mobile exists. Mobile Android ships before iOS (different review timelines). Admin UI depends on real pings from Phase 16.2.

---

## Part 15 — Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Apple rejects iOS background tracking during App Store review | Low–Medium | High | `BGTaskScheduler` with fetch/processing modes is standard-approved. Not using streaming location (which requires review). Prepare rationale for review. |
| Android 12+ users deny background location (40%+ do) | Medium | Medium | Feature degrades gracefully — no tracking, no crash. UI informs employee. Admin sees "tracking unavailable" state. |
| GPS spoofing by employees | Medium | Medium | Accept as known limitation. Cannot fully prevent at software level without device attestation. Document as accepted risk. |
| WorkManager Doze causes >60 min gaps on Android (battery saver) | Medium | Low | Gaps in route history are acceptable — feature is for audit/reference, not real-time monitoring. Document expected behaviour. |
| OpenStreetMap tile server availability | Low | Low | OSM tiles have 99.9%+ uptime. Fallback: configure a self-hosted tile server URL in CompanySettings. |
| LocationPing collection grows large (high employee count) | Low | Medium | TTL index purges pings after 90 days. Index on `{ attendanceSessionId, timestamp }` keeps queries fast. At 10 pings/day × 500 employees × 90 days = 450,000 documents — well within MongoDB Atlas free/shared tier range. |

---

## Part 16 — Files Requiring Modification / Creation

### New files (13)

| File | Purpose |
|---|---|
| `apps/admin/src/models/LocationPing.ts` | Mongoose model for location ping documents |
| `apps/admin/src/services/LocationService.ts` | Business logic: store ping, get history, get current |
| `apps/admin/src/app/api/v1/attendance/location/route.ts` | POST — employee uploads location ping |
| `apps/admin/src/app/api/v1/attendance/[sessionId]/location/route.ts` | GET — admin retrieves session pings |
| `apps/admin/src/app/api/v1/employees/[id]/location/current/route.ts` | GET — admin views current location |
| `apps/admin/src/app/api/v1/settings/location-tracking/route.ts` | GET + PATCH — location tracking settings |
| `apps/admin/src/__tests__/location/LocationService.test.ts` | Unit tests |
| `apps/admin/src/app/(portal)/employees/[id]/location/page.tsx` | Admin map page |
| `apps/admin/src/app/(portal)/settings/location-tracking/page.tsx` | Settings page |
| `apps/mobile/lib/features/attendance/services/location_tracking_service.dart` | Background tracking orchestration |
| `apps/mobile/lib/features/attendance/providers/tracking_provider.dart` | Riverpod provider wrapper |
| `apps/mobile/android/app/src/main/kotlin/com/genesis/workforce/LocationTrackingWorker.kt` | Android WorkManager worker (Kotlin glue) |

### Modified files (11)

| File | Change |
|---|---|
| `apps/admin/src/models/CompanySettings.ts` | Add `locationTracking` sub-document to interface + schema |
| `apps/admin/src/validators/settings.ts` | Add `UpdateLocationTrackingSchema` |
| `apps/admin/src/services/SettingsService.ts` | Add `updateLocationTracking()` method |
| `apps/admin/src/validators/attendance.ts` | Add `LocationPingSchema` |
| `apps/admin/src/services/AttendanceService.ts` | Add `requiresTracking` + `trackingIntervalMinutes` to check-in response |
| `apps/mobile/pubspec.yaml` | Add `workmanager`, `connectivity_plus` |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | Add background location + foreground service permissions + service declaration |
| `apps/mobile/ios/Runner/Info.plist` | Add `UIBackgroundModes`, `BGTaskSchedulerPermittedIdentifiers`, `NSLocationAlwaysUsageDescription` |
| `apps/mobile/ios/Runner/AppDelegate.swift` | Register `BGTaskScheduler` identifier |
| `apps/mobile/lib/features/attendance/presentation/screens/home_screen.dart` | Call `startTracking` / `stopTracking` on check-in / checkout |
| `apps/mobile/lib/main.dart` | Register WorkManager `callbackDispatcher` |

**Total: 13 new files, 11 modified files = 24 file touches across backend, mobile (Android + iOS), and admin portal.**

---

## Part 17 — Recommendation

Implement in 4 sequential phases as outlined in §14. Start with Phase 16.1 (backend) to unblock API readiness for mobile and admin teams working in parallel.

**Do not attempt all 4 phases in one shot.** Each phase has independent testability and the mobile phases require real-device QA that cannot be validated programmatically.

**Priority ordering:** Phase 16.1 (backend) → Phase 16.2 (Android) → Phase 16.4 (Admin UI) → Phase 16.3 (iOS). Android has higher employee device share and simpler background permission UX than iOS. Admin UI can ship as soon as Android starts producing pings.

---

## Decision

**Feature does NOT currently exist.** Architecture and design is complete. The system is ready for Phase 16.1 implementation upon approval.

---

*Verified: 2026-06-26*  
*No code modified during this phase.*
