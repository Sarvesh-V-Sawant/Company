# Phase 17.07 — Attendance & Remote Module Final UAT / Production Readiness Report

**Date:** 2026-07-11 (Sat)
**Environment:** Local dev (Next.js 16 Turbopack, MongoDB Atlas, Flutter debug APK, device 700dd050)
**Rules:** No commits. No pushes. No deploys. No secrets printed. No payroll.

---

## Phase A — Baseline Safety Audit

| Check | Finding | Status |
|---|---|---|
| Stale test routes | None found. `location-snapshots` grep hit `dateString` param (query field, not test code) | ✓ PASS |
| DIAG/console.log in services | None found | ✓ PASS |
| `.env.local` in gitignore | `.env.*` and `.env.local` in both root and admin `.gitignore` | ✓ PASS |
| `.env.example` sanitized | All values are placeholders; `SEED_ADMIN_INITIAL_PASSWORD` is blank | ✓ PASS |
| Geofence restored | `lat=19.201, lng=73.086, r=200m, isEnabled=true` | ✓ PASS |
| `allowOutsideGeofence` state | `false` (test employee) — correct for prod baseline | ✓ PASS |

---

## Phase B — Static / Build Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `flutter analyze --no-fatal-infos` | **PASS** — 0 issues |
| `flutter build apk --debug` | **PASS** — `app-debug.apk` built (17.6s Gradle) |
| APK installed to device 700dd050 | **PASS** — `adb install -r` Success |

---

## Phase C — Integrated Runtime UAT

### C.1 — Normal Office Attendance (inside geofence)

| Step | Expected | Result |
|---|---|---|
| Geofence = Dombivli East 19.201/73.086/200m | In effect | ✓ |
| `allowOutsideGeofence=false` | In effect | ✓ |
| Tap CHECK IN (phone GPS at ~19.2019, inside 200m radius) | Check-in succeeds | ✓ |
| Home shows "Checked In · Since 22:39 · Dombivli East, Thane" | No Remote chip | ✓ |
| `GET /remote-active-locations` | `total: 0` | ✓ |
| No map marker | Confirmed | ✓ |

**C.1: PASS**

---

### C.2 — Outside-Geofence Blocked

| Step | Expected | Result |
|---|---|---|
| Geofence moved to Churchgate (18.9322/72.8264/200m) | Phone at Dombivli = 40km outside | ✓ |
| `allowOutsideGeofence=false` | Block enforced | ✓ |
| Tap CHECK IN | "Outside Office Location" dialog appears | ✓ |
| Dialog shows "Request Work Away" button | Visible | ✓ |
| No generic error message | No error code shown | ✓ |

**C.2: PASS**

---

### C.3 — Work Away Request

| Step | Expected | Result |
|---|---|---|
| Tap "Request Work Away" | Work Away regularisation form opens | ✓ |
| Form pre-fills date = 11 Jul 2026 | Correct | ✓ |
| Form pre-fills type = "Work Away From Office" | Correct | ✓ |
| Submit with reason "UAT-work-away" | **BLOCKED** — BR-REG-03 fires: "This date already has a completed attendance record" | ⚠ BLOCKED |

**C.3: PARTIAL** — Form, routing, and validation all work correctly. Submit blocked by BR-REG-03 because this test date already has attendance sessions (expected by design). No error crash; correct validation message shown.

**Observation:** Work Away via form from outside-geofence dialog is correctly gated by the same anti-manipulation check as other regularization types. This is a product decision tradeoff. If forward Work Away should bypass BR-REG-03, that is a future enhancement (not a regression).

---

### C.4 — Remote Check-in After Admin Override

| Step | Expected | Result |
|---|---|---|
| Admin sets `allowOutsideGeofence=true` via PUT employee API | Set | ✓ |
| Geofence still at Churchgate | Phone outside | ✓ |
| Tap CHECK IN | Remote check-in succeeds | ✓ |
| Home shows "Checked In · Remote · Since 22:49 · Dombivli East, Thane" | Remote chip visible | ✓ |
| "Remote session active. Location will be recorded periodically..." | Notice visible | ✓ |
| Address "Dombivli East, Thane" shown | ✓ Geocoded |  ✓ |

**C.4: PASS**

---

### C.5 — Location Snapshot Stored + Checkout Cleanup

| Step | Expected | Result |
|---|---|---|
| `GET /location-snapshots?employeeId=...&limit=1` | `lat=19.2019, address=Dombivli East, Thane, geocodingStatus=success` | ✓ |
| `GET /remote-active-locations` | `total:1, freshness:fresh, snapshot address=Dombivli East, Thane` | ✓ |
| Admin map page (browser) | Green marker at snapshot coords | ✓ |
| Tap CHECK OUT → confirm dialog → confirm | Checkout succeeds | ✓ |
| `GET /remote-active-locations` after checkout | `total: 0` | ✓ |
| Map shows empty overlay | Confirmed | ✓ |

**C.5: PASS**

---

### C.6 — Attendance History

| Step | Expected | Result |
|---|---|---|
| DailyDetail for Sat 11 Jul | Sessions 1,2,3,5 = Remote badge; Sessions 4,6 = no badge | ✓ |
| Session 1 (pre-geocoding) | Shows coords `19.20195, 73.08664` as fallback | ✓ |
| Sessions 2–6 | Shows "Dombivli East, Thane" address | ✓ |
| No Regularise button on Sat 11 Jul (weekend + sessions) | No button shown | ✓ |
| DailyDetail for Fri 10 Jul (Absent, 6-min session) | "No regularization for this date" | ✓ |

**C.6: PASS** — Remote badges, address/coord fallback, no-regularise gating all correct.

**Note:** No pristine absent day (zero sessions) available in test account to verify "Apply Leave only" CTA. All days in range have dev-testing sessions. Untested path noted.

---

### C.7 — Regularisation Anti-Manipulation

| Check | Result |
|---|---|
| Day with sessions → no Regularise button | ✓ PASS |
| Weekend day → no Regularise button | ✓ PASS |
| BR-REG-03 fires on submit for day with attendance | ✓ PASS (C.3 above) |
| Duplicate request rejection | Not re-tested (verified Phase 16.01) |
| Forgot-checkout guard | Not re-tested (verified Phase 16.00) |

**C.7: PASS** (primary paths confirmed)

---

### C.8 — Notifications

| Check | Result |
|---|---|
| In-app Notifications tab shows notification list | ✓ PASS — 8+ notifications visible |
| Notification text shows type and date | ✓ "Regularization Request Approved · Your attendance regularization request for 2026-07-05 has been approved" |
| Tap notification → route navigation | ⚠ INCONCLUSIVE — tap did not navigate away from list in this test run (possible tap miss or notification type without detail route) |

**C.8: PARTIAL** — List rendering PASS. Tap routing inconclusive. Previously verified in Phase 15.42.

---

## Phase D — Admin UI API Checks

*(Browser visual checks deferred; API-level verification below)*

| Endpoint | Result |
|---|---|
| `GET /api/v1/employees?limit=5` | ✓ PASS — `success=true, count=5` |
| `PUT /api/v1/employees/[id]` (allowOutsideGeofence toggle) | ✓ PASS — used in C.4 |
| `GET /api/v1/regularizations?status=pending` | ✓ PASS — `success=true, count=1` |
| `GET /api/v1/regularizations?type=workAwayFromOffice` | ✓ PASS — `success=true, count=5` (Work Away filter works) |
| `GET /api/v1/attendance/remote-active-locations` | ✓ PASS — `success=true, total=0` (post-checkout) |
| `GET /api/v1/attendance?limit=5` | ✓ PASS — `success=true, count=5` |
| `PATCH /api/v1/settings/geofence` | ✓ PASS — used in C.2/C.4 setup + restore |
| `GET /api/v1/attendance/location-snapshots` | ✓ PASS — snapshot verified in C.5 |
| Admin remote-locations page (/attendance/remote-locations) | ✓ PASS — map + table + empty state verified (Phase 17.06) |
| No infinite loaders | Not observed |
| No raw errors exposed to UI | Not observed |

---

## Phase E — Security / Deployment Blocker Summary

**These items are noted only. No fixes attempted in this phase.**

| Blocker | Status | Priority |
|---|---|---|
| **P0: Secret rotation** — JWT_SECRET, JWT_REFRESH_SECRET, MongoDB URI, Upstash tokens must be rotated before any production deployment (secrets may be exposed in git history from dev phase) | **PENDING** | P0 |
| **Vercel environment variables** — All secrets must be set in Vercel project settings (not from `.env.local`) before production deploy | **PENDING** | P0 |
| **GitHub history exposure decision** — If secrets were ever committed, git history rewrite (BFG/filter-branch) or repository re-creation needed | **PENDING** | P0 |
| **Firebase private key** — Must be set in Vercel env with literal `\n` newlines; not verifiable without production environment | **PENDING** | P0 |
| **SEED_ADMIN_INITIAL_PASSWORD** — Must be removed from Vercel env after first seed | **PENDING** | P1 |
| **Nominatim usage policy** — Nominatim ToS requires attribution and reasonable usage. High-volume production may need to switch to Google (`GEOCODING_PROVIDER=google`) or self-hosted Nominatim | **NOTED** | P2 |

---

## Files Changed Since Phase 16

| File | Change |
|---|---|
| `apps/admin/src/models/AttendanceSession.ts` | Added `address`, `geocodingStatus`, `geocodingProvider` to CheckInSchema |
| `apps/admin/src/models/LocationSnapshot.ts` | Added `address`, `geocodingStatus`, `geocodingProvider` fields |
| `apps/admin/src/models/index.ts` | LocationSnapshot export |
| `apps/admin/src/services/GeocodingService.ts` | New — Nominatim + Google geocoding, 5s timeout, never-throws |
| `apps/admin/src/services/AttendanceService.ts` | Fire-and-forget geocoding at check-in; `checkInAddress` in responses |
| `apps/admin/src/services/LocationSnapshotService.ts` | Fire-and-forget geocoding at snapshot; address in list response |
| `apps/admin/src/services/RemoteLocationsService.ts` | New — active remote session aggregation with freshness |
| `apps/admin/src/app/api/v1/attendance/remote-active-locations/route.ts` | New — admin-only GET endpoint |
| `apps/admin/src/app/api/v1/attendance/location-snapshot/route.ts` | New — mobile POST snapshot endpoint |
| `apps/admin/src/app/api/v1/attendance/location-snapshots/route.ts` | New — admin GET snapshots endpoint |
| `apps/admin/src/validators/locationSnapshot.ts` | New — snapshot validators |
| `apps/admin/src/app/(portal)/attendance/remote-locations/page.tsx` | New — admin list + map page |
| `apps/admin/src/app/(portal)/attendance/page.tsx` | Added "Remote" tab link |
| `apps/admin/src/components/maps/RemoteLocationMap.tsx` | New — pigeon-maps component |
| `apps/admin/src/middleware/rateLimiter.ts` | `refreshLimiter` added |
| `apps/admin/.env.example` | Geocoding section added |
| `apps/admin/package.json` | `pigeon-maps: ^0.22.1` added |
| `apps/admin/src/app/api/v1/regularizations/route.ts` | Work Away type filter |
| `apps/admin/src/app/(portal)/regularization/page.tsx` | Work Away filter UI |
| `apps/admin/src/validators/regularization.ts` | BR-REG-03 and eligibility rules updated |
| `apps/mobile/lib/core/models/attendance.dart` | `checkInAddress`, `isRemote`, `remoteSource` fields |
| `apps/mobile/lib/core/constants/api_endpoints.dart` | Location snapshot endpoint |
| `apps/mobile/lib/core/di/providers.dart` | LocationSnapshotSource provider |
| `apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart` | Pass-through of `checkInAddress` |
| `apps/mobile/lib/features/attendance/data/sources/location_snapshot_source.dart` | New — snapshot upload source |
| `apps/mobile/lib/features/attendance/presentation/providers/attendance_provider.dart` | Snapshot upload trigger |
| `apps/mobile/lib/features/attendance/presentation/screens/daily_detail_screen.dart` | Remote badge, address display |
| `apps/mobile/lib/features/device_registration/providers/device_request_provider.dart` | Device registration improvements |
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | Remote chip, address display, snapshot notice |

---

## Runtime Evidence Summary

| Test | Date | Key Evidence |
|---|---|---|
| Normal check-in | 2026-07-11 22:39 IST | "Checked In · Since 22:39", remote list = 0 |
| Outside-geofence block | 2026-07-11 22:44 IST | "Outside Office Location" dialog, "Request Work Away" button |
| BR-REG-03 Work Away block | 2026-07-11 22:47 IST | "This date already has a completed attendance record" |
| Remote check-in (override) | 2026-07-11 22:49 IST | "Checked In · Remote", remote list total=1 |
| Geocoding | Multiple sessions | address="Dombivli East, Thane", geocodingStatus="success" |
| Snapshot stored | 2026-07-11 22:49 IST | lat=19.2019, address confirmed via API |
| Admin remote list | 2026-07-11 22:49 IST | total=1, freshness=fresh, all fields present |
| Admin map (pigeon-maps) | 2026-07-11 22:24 IST (Phase 17.06) | Green marker at coords, popup card, legend |
| Checkout cleanup | 2026-07-11 22:53 IST | remote list = 0, map empty |
| Remote badge + address fallback | 2026-07-11 22:55 IST | DailyDetail: Remote on remote sessions, coords for old sessions, address for new |
| In-app notifications | 2026-07-11 23:00 IST | 8+ notifications visible, approval messages correct |

---

## Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Nominatim ToS at scale | Medium | Switch to Google or self-hosted before high volume; `GEOCODING_PROVIDER` env flag in place |
| Notification tap routing not re-verified | Low | Previously verified Phase 15.42; list rendering confirmed today |
| Work Away submit blocked same-day with sessions | Low | By design (BR-REG-03). Future: explicit carve-out for forward Work Away requests |
| Background hourly snapshots (foreground-only) | Medium | Only foreground snapshots implemented. Phase 17.08 background service needed for reliable tracking |
| No pristine absent day UAT for "Apply Leave" CTA | ~~Low~~ **RESOLVED** | Fixed in Phase 17.08 — backend now generates synthetic absent records. Verified on device (Tue 7 Jul 2026). |
| Payroll module not started | N/A | Out of scope for this phase |

---

## UAT Matrix — Final

| Flow | Status | Notes |
|---|---|---|
| Normal office check-in/out | ✅ PASS | No Remote chip, not on remote list |
| Outside-geofence blocked UX | ✅ PASS | Dialog + Request Work Away button |
| Work Away form pre-fill | ✅ PASS | Date + type pre-filled |
| Work Away submit (same-day) | ⚠ BLOCKED | BR-REG-03 expected; clean-day test not feasible today |
| Remote check-in (admin override) | ✅ PASS | Remote chip, address, snapshot |
| Remote session metadata | ✅ PASS | isRemote, remoteSource, geocoding all correct |
| Admin active remote list | ✅ PASS | total, freshness, address |
| Admin map marker | ✅ PASS | pigeon-maps green marker, popup card |
| Checkout cleans up | ✅ PASS | Remote list → 0, map clears |
| DailyDetail remote badge | ✅ PASS | Remote badge on remote sessions |
| DailyDetail address/fallback | ✅ PASS | Coords for old, address for new |
| No regularise on sessions day | ✅ PASS | BR-REG-03 gating confirmed |
| True absent → Apply Leave only, no Regularise | ✅ PASS | Phase 17.08 — Tue 7 Jul 2026 on device |
| In-app notification list | ✅ PASS | Renders correctly |
| Notification tap routing | ⚠ INCONCLUSIVE | Tap may have missed; list OK |
| TypeScript build | ✅ PASS | 0 errors |
| Flutter analyze | ✅ PASS | 0 issues |
| Flutter debug build | ✅ PASS | APK built & installed |
| .env.example sanitized | ✅ PASS | All placeholders |
| .env.local gitignored | ✅ PASS | Both root + admin gitignore |
| Settings restored after UAT | ✅ PASS | geofence lat=19.201/lng=73.086/r=200 + allowOutsideGeofence=false confirmed |

---

## Deployment Blockers

1. **P0 — Secret rotation** (JWT, refresh JWT, MongoDB URI, Upstash, Brevo, Firebase private key)
2. **P0 — Vercel environment variable setup**
3. **P0 — Git history audit** (determine if secrets were ever committed; rewrite or migrate if so)
4. **P1 — `SEED_ADMIN_INITIAL_PASSWORD` removed from Vercel env after seeding**

---

## Final Decision

### Attendance Module — **READY**

All core attendance and remote tracking flows have been tested and verified. The module behaves correctly in normal, blocked, and remote scenarios. Geocoding, snapshots, admin UI, and anti-manipulation rules all function as specified.

Minor gaps:
- Notification tap routing inconclusive (was verified in Phase 15.42)
- Work Away same-day submit is blocked by design (not a regression)
- Background snapshots are foreground-only pending Phase 17.08

### Production Deployment — **NOT READY**

**Blocker:** P0 secret rotation and Vercel environment setup not complete. No code changes needed. Deployment requires:
1. Rotate all secrets (JWT pair, MongoDB URI, Upstash tokens, Brevo key)
2. Set all secrets in Vercel project environment
3. Audit git history for any committed secrets
4. Remove `SEED_ADMIN_INITIAL_PASSWORD` after first seed

---

## Recommended Next Phase

**Phase 18.00 — Production Deployment Preparation**:
1. Secret rotation
2. Vercel env configuration
3. Git history audit
4. Production deploy + smoke test

---

## Phase 17.08 — Fix Working-Day True Absent Display

**Date:** 2026-07-12
**Scope:** Backend only — no mobile code changes needed.

### Root Cause

`AttendanceService.getHistory()` queried only existing `AttendanceDay` documents. For past working days where an employee never checked in, no `AttendanceDay` document is created, so the API returned nothing for those dates. The mobile weekly screen received no record and showed a `'—'` dash or faded dot instead of "Absent".

### Fix (Phase B — Backend)

`apps/admin/src/services/AttendanceService.ts` — `getHistory()` rewritten to:

1. Fetch all existing `AttendanceDay` docs in range (un-paginated — range ≤ 31 days)
2. Fetch holidays in range from `Holiday` collection
3. Enumerate every calendar day in `[startDate, endDate]`
4. For days with no existing doc: skip if future, skip if holiday, skip if not in `settings.workingDays` → generate synthetic absent record
5. Merge real + synthetic, apply status filter, paginate on merged list
6. Load sessions only for real days in the page slice

Synthetic absent record shape matches `formatDayRecord` output: `status:'absent'`, `totalMinutes:0`, `sessions:[]`, `isRegularized:false`, etc.

### Phase C — Mobile UI

No changes required. `DailyDetailScreen` already handled `status='absent' + sessions=[]` correctly:
- Shows "Absent" `StatusChip` ✓
- Shows "No regularization for this date." card ✓
- Shows **"Apply Leave"** button only ✓
- No "Regularise" button ✓

`WeeklyAttendanceScreen` already renders `_DayCell('✗', red)` and `_DayListTile → StatusChip('absent')` for records with `status='absent'`.

### Phase D — Runtime Test (2026-07-12, ~02:50 IST, device 700dd050)

| Verification | Expected | Result |
|---|---|---|
| Weekly screen Jul 6–11 | Mon–Fri show red ✗ + "Absent" chip | ✓ All 5 working days show Absent |
| Sat 11 Jul | "Weekend" (not Absent) | ✓ |
| Week Summary | "Absent: 5" | ✓ |
| DailyDetail — Tue 7 Jul (true absent, no sessions) | "Absent" chip, no sessions, "Apply Leave" only, no Regularise | ✓ All confirmed |
| DailyDetail — Mon 6 Jul (sessions present, isRegularized) | Sessions shown, "Regularization applied" | ✓ |

### Phase E — Build Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `flutter analyze --no-pub` | **PASS** — 0 issues |
| Flutter APK rebuild | Not required — no mobile code changed |

### Files Changed

| File | Change |
|---|---|
| `apps/admin/src/services/AttendanceService.ts` | `getHistory()` rewritten to generate synthetic absent for past working days with no `AttendanceDay` doc |

### Updated Risk Register

| Risk | Status |
|---|---|
| No pristine absent day UAT for "Apply Leave" CTA | ✅ RESOLVED — Tue 7 Jul confirmed in Phase 17.08 |
| Background snapshots foreground-only | Still pending Phase 17.09+ |

---

## Phase 18.02 — Final Local Baseline Before Payroll Planning

**Date:** 2026-07-12
**Objective:** Confirm local app baseline is stable before starting Payroll module planning.

### Phase A — Cleanup and Safety

| Check | Result |
|---|---|
| Stale background shells | 7 node processes from Phase 17 dev server — no action (server intentionally running) |
| DIAG / console.log in services + API routes | **None found** |
| Temp test routes | **None found** |
| `.env.example` sanitized | **PASS** — all values are placeholders; `SEED_ADMIN_INITIAL_PASSWORD` blank |
| `.env.local` gitignored | **PASS** — `.env.*` and `.env.local` in both root and `apps/admin` `.gitignore`; `!.env.example` whitelisted |

### Phase B — Git / Worktree Status

**Modified (M) — tracked files with Phase 16–17 changes not yet committed:**

| Category | Files |
|---|---|
| Attendance/Remote features | `apps/admin/src/models/AttendanceSession.ts`, `apps/admin/src/models/index.ts`, `apps/admin/src/services/AttendanceService.ts`, `apps/admin/src/services/RegularizationService.ts`, `apps/admin/src/app/(portal)/attendance/page.tsx`, `apps/admin/src/app/(portal)/regularization/page.tsx`, `apps/admin/src/app/api/v1/auth/refresh/route.ts`, `apps/admin/src/app/api/v1/regularizations/route.ts`, `apps/admin/src/validators/regularization.ts` |
| Mobile attendance | `apps/mobile/lib/core/models/attendance.dart`, `apps/mobile/lib/core/constants/api_endpoints.dart`, `apps/mobile/lib/core/di/providers.dart`, `apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart`, `apps/mobile/lib/features/attendance/presentation/providers/attendance_provider.dart`, `apps/mobile/lib/features/attendance/presentation/screens/daily_detail_screen.dart`, `apps/mobile/lib/features/home/presentation/screens/home_screen.dart`, `apps/mobile/lib/features/device_registration/providers/device_request_provider.dart` |
| Security hardening | `apps/admin/src/middleware/rateLimiter.ts` |
| Config/env hygiene | `apps/admin/.env.example`, `apps/admin/package.json`, `.gitignore`, `package-lock.json` |

**Untracked (??) — new files from Phase 17 not yet committed:**

| Category | Files |
|---|---|
| Remote location | `apps/admin/src/app/(portal)/attendance/remote-locations/`, `apps/admin/src/app/api/v1/attendance/location-snapshot/`, `apps/admin/src/app/api/v1/attendance/location-snapshots/`, `apps/admin/src/app/api/v1/attendance/remote-active-locations/`, `apps/admin/src/components/maps/`, `apps/admin/src/models/LocationSnapshot.ts`, `apps/admin/src/services/GeocodingService.ts`, `apps/admin/src/services/LocationSnapshotService.ts`, `apps/admin/src/services/RemoteLocationsService.ts`, `apps/admin/src/validators/locationSnapshot.ts` |
| Mobile location | `apps/mobile/lib/features/attendance/data/sources/location_snapshot_source.dart` |
| Docs | `docs/77-*` through `docs/83-*` |

No unexpected files. All changes are accounted for under Phases 15–17.08.

### Phase C — Static / Build Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `flutter analyze --no-pub` | **PASS** — 0 issues (ran in 3.8s) |
| `flutter build apk --debug` | **PASS** — `app-debug.apk` built (32.8s Gradle) |

### Phase D — Connected-Device Smoke Test

**Device 700dd050 was disconnected during Phase 18.02. Items D.1–D.6 carry forward from Phase 17.08 (same session, verified ~02:50 IST).**

| # | Check | Result |
|---|---|---|
| D.1 | App launches | ✓ PASS (Phase 17.08) |
| D.2 | Login / session restore | ✓ PASS (Phase 17.08) |
| D.3 | Home screen loads | ✓ PASS — "Good morning, Sarvesh!", CHECK IN, Quick Actions visible |
| D.4 | Attendance tab loads | ✓ PASS — Weekly screen Jul 6–11 rendered |
| D.5 | Weekly: working-day absents show Absent | ✓ PASS — Mon–Fri all red ✗ + "Absent" chip |
| D.6 | True absent detail: Apply Leave only, no Regularise | ✓ PASS — Tue 7 Jul: "Absent" + "Apply Leave" button, no Regularise |
| D.7 | Admin endpoint `/remote-active-locations` | ✓ PASS — 401 (server up, auth gate active) |
| D.8 | Notifications tab loads | ⚠ NOT VERIFIED — device disconnected |
| D.9 | Logout works | ⚠ NOT VERIFIED — device disconnected |
| D.10 | No DioException / black screen / blank screen | ✓ PASS (Phase 17.08 — no errors observed) |

D.8 and D.9 are low risk: notifications tab was verified Phase 17.07; logout was verified Phase 15.46. No code touching those paths changed since.

### Phase E — Readiness Summary

#### Attendance Module — **READY**

All flows verified across Phases 16–17.08:
- Normal check-in/out ✓
- Outside-geofence block + Work Away UX ✓
- Remote check-in (admin override) ✓
- Geocoding + address labels ✓
- Location snapshots (foreground) ✓
- Admin remote list + map (pigeon-maps) ✓
- True absent display (Phase 17.08 fix) ✓
- Regularization anti-manipulation ✓
- Notifications list ✓

#### Production Deployment — **NOT READY**

Same P0 blockers as Phase 17.07. No code changes needed — ops only.

| Blocker | Priority |
|---|---|
| JWT_SECRET + JWT_REFRESH_SECRET rotation | P0 |
| MongoDB URI rotation | P0 |
| Upstash tokens rotation | P0 |
| Brevo API key rotation | P0 |
| Firebase private key rotation | P0 |
| Git history audit for committed secrets | P0 |
| Vercel environment variable setup | P0 |
| Remove `SEED_ADMIN_INITIAL_PASSWORD` from Vercel after seed | P1 |

#### Recommendation — Start Payroll Planning

Local baseline is stable. No regressions found. Static checks pass. APK builds clean. The attendance module is feature-complete and locally verified.

---

## Phase 18.03 — Connected Device Smoke Closure

**Date:** 2026-07-12
**Device:** OPPO F29 5G · 700dd050 (CPH2721)
**APK:** app-debug.apk built 2026-07-12 11:47 (171.5 MB)
**Rules:** No commits. No pushes. No deploys. No secrets printed. No code changes.

### Phase A — ADB Readiness

| Check | Result |
|---|---|
| adb kill-server / start-server | ✓ Daemon started |
| adb devices | `700dd050 device` (CPH2721 / OP5ED7L1) |
| adb reverse tcp:3000 tcp:3000 | ✓ Active (`UsbFfs tcp:3000 tcp:3000`) |

### Phase B — APK Install

APK existed. `adb install -r` → **Success**. No rebuild needed.

### Phase C — Mobile Smoke Results

| # | Check | Result |
|---|---|---|
| C.1 | App launches without black screen | ✓ PASS |
| C.2 | Session restore — Home loads as Sarvesh | ✓ PASS |
| C.3 | Home screen: shift card, CHECK IN, Quick Actions, month stats | ✓ PASS |
| C.4 | Attendance tab loads | ✓ PASS |
| C.5 | Weekly Jul 6–11: Mon–Fri all Absent (red ✗), Sat Weekend, Summary Absent:5 | ✓ PASS |
| C.6 | Daily detail Tue 7 Jul: Absent chip + Apply Leave only, no Regularise | ✓ PASS |
| C.7 | Notifications tab loads: 8+ notifications, 2 unread, no crash | ✓ PASS |
| C.8 | Logout: confirmation dialog → Sign Out → clean login screen (v1.0.0 · Build 1) | ✓ PASS |

No raw DioException. No GoRouter assertion. No black screen. No blank critical screen.

### Phase D — Admin Remote Endpoint

Admin server running (HTTP 200 on localhost:3000). No authenticated browser session available — remote-active-locations page **not re-verified**. Relying on Phase 17.06/17.07 prior verification.

### Unverified Items

- `/attendance/remote-locations` admin page (no auth session this run) — verified in Phase 17.06/17.07

### Final Local Baseline Status: **CLOSED**

All critical mobile checks pass. Attendance module locally verified end-to-end.

**Payroll planning can start.** Recommended next phase: Phase 19.00 — Payroll Module Planning and Architecture Audit.

**Next:** Phase 19.00 — Payroll Module Planning.
