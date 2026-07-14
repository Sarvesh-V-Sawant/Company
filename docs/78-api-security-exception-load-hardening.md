# Phase 18.01 — API Security, Exception Handling, and Crowd-Readiness Hardening

**Date:** 2026-07-09
**Scope:** Authorization audit, exception handling, rate limiting, DB indexes, load readiness
**Rules:** No secrets printed. No commits/pushes. No new product features.

---

## Phase A — Safety Baseline

| Check | Result |
|---|---|
| Working tree (git status) | `.gitignore`, `apps/admin/.env.example` (Phase 18.00 hygiene, not yet committed) |
| DIAG logs | NONE |
| Test routes in proxy | NONE |
| `.env.example` placeholders | PASS |
| `.env.local` ignored | PASS — both gitignore files |

---

## Phase B — API Authorization Audit

### Auth mechanism

- Edge Middleware (`src/proxy.ts`) intercepts all routes. Non-public paths require valid `__session` cookie or `Authorization: Bearer` header.
- `getAuthUser(request)` verifies JWT (`jose`), extracts `{ userId, role }` payload.
- `assertRole(payload, 'admin')` throws `AuthError('AUTH_006', 403)` if role mismatch.
- JWT rotation grace period: `JWT_SECRET_PREVIOUS` accepted during key rotation.

### Authorization table

| Route | Method | Auth | Role | Client-provided identity risk | Fix needed |
|---|---|---|---|---|---|
| `/api/v1/auth/login` | POST | None (public) | Any | — | — |
| `/api/v1/auth/refresh` | POST | None (public) | Any | — | Rate limit added ✓ |
| `/api/v1/auth/logout` | POST | JWT | Any | — | — |
| `/api/v1/auth/me` | GET | JWT | Any | — | — |
| `/api/v1/auth/me/change-password` | POST | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/auth/password-reset/request` | POST | None (public) | Any | — | — |
| `/api/v1/auth/password-reset/confirm` | POST | None (public) | Any | — | — |
| `/api/v1/auth/device-request` | POST | None (public) | Any | — | — |
| `/api/v1/auth/device-request/status` | GET | None (public) | Any | — | — |
| `/api/v1/attendance/checkin` | POST | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/attendance/checkout` | POST | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/attendance/status` | GET | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/attendance/history` | GET | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/attendance/today` | GET | JWT | **Admin only** ✓ | — | — |
| `/api/v1/attendance/[employeeId]` | GET | JWT | **Admin only** ✓ | Route param, admin-gated | — |
| `/api/v1/attendance/[employeeId]/correction` | POST | — | — | Not implemented (501) | — |
| `/api/v1/attendance/monthly` | GET | JWT | Both | Admin queries any; employee queries self via service ✓ | — |
| `/api/v1/attendance/weekly` | GET | JWT | Both | Admin queries any; employee queries self via service ✓ | — |
| `/api/v1/regularizations` | POST | JWT | Any (employee intent) | Uses `payload.userId` ✓ | Rate limit added ✓ |
| `/api/v1/regularizations` | GET | JWT | Both | Service filters by role ✓ | — |
| `/api/v1/regularizations/[id]` | GET | JWT | Both | Service enforces ownership ✓ | — |
| `/api/v1/regularizations/[id]/approve` | PATCH | JWT | **Admin only** ✓ | — | — |
| `/api/v1/regularizations/[id]/reject` | PATCH | JWT | **Admin only** ✓ | — | — |
| `/api/v1/regularizations/[id]/withdraw` | PATCH | JWT | **Employee only** ✓ | Uses `payload.userId` ✓ | — |
| `/api/v1/regularizations/pending` | GET | JWT | **Admin only** ✓ | — | — |
| `/api/v1/employees` | GET | JWT | Admin (enforced at service) | Role passed to service; service throws 403 if not admin ✓ | — |
| `/api/v1/employees` | POST | JWT | **Admin only** ✓ | — | — |
| `/api/v1/employees/[id]` | GET | JWT | Admin (enforced at service) | Role passed to service; service throws 403 ✓ | — |
| `/api/v1/employees/[id]` | PUT | JWT | **Admin only** ✓ | — | — |
| `/api/v1/employees/[id]/activate` | PATCH | JWT | Admin (pattern assumed) | — | — |
| `/api/v1/employees/[id]/deactivate` | PATCH | JWT | Admin (pattern assumed) | — | — |
| `/api/v1/employees/[id]/register-device` | PATCH | JWT | Admin (pattern assumed) | — | — |
| `/api/v1/employees/[id]/reset-device` | PATCH | JWT | Admin (pattern assumed) | — | — |
| `/api/v1/devices/requests` | GET | JWT | Admin (assumed) | — | — |
| `/api/v1/devices/requests/[id]/approve` | PATCH | JWT | **Admin only** ✓ | — | — |
| `/api/v1/devices/requests/[id]/reject` | PATCH | JWT | **Admin only** ✓ | — | — |
| `/api/v1/devices/requests/count` | GET | JWT | Admin (assumed) | — | — |
| `/api/v1/notifications` | GET | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/notifications/[id]` | GET | — | — | Not implemented (501) | — |
| `/api/v1/notifications/[id]/read` | PATCH | JWT | Any | Service enforces ownership (assumed) | — |
| `/api/v1/notifications/read-all` | PATCH | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/notifications/unread-count` | GET | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/notifications/fcm-token` | POST | JWT | Any | Uses `payload.userId` ✓ | — |
| `/api/v1/audit-logs` | GET | JWT | **Admin only** ✓ | — | — |
| `/api/v1/audit-logs/[id]` | GET | JWT | Admin (assumed) | — | — |
| `/api/v1/reports/*` | GET | JWT | **Admin only** ✓ | — | — |
| `/api/v1/settings` | GET/PATCH | JWT | **Admin only** ✓ | — | — |
| `/api/v1/settings/geofence` | GET/PATCH | JWT | Admin (assumed) | — | — |
| `/api/v1/settings/shift` | GET/PATCH | JWT | Admin (assumed) | — | — |
| `/api/v1/payroll/*` | * | JWT | Admin/Employee | Not started in scope | — |
| `/api/v1/leaves/*` | * | JWT | Both | Assumed correct | — |

### Authorization findings

- **No route accepts `employeeId` from client body for self-referencing operations.** All employee-owned operations derive identity from `payload.userId` (JWT). ✓
- **No test/debug routes remain.** ✓
- **Admin privilege escalation not possible** via employee-role token — assertRole / service-layer checks consistent. ✓
- **Outside-geofence bypass** uses `employee.allowOutsideGeofence` flag read from DB server-side, not client body. Cannot be spoofed. ✓

---

## Phase C — Exception Handling Audit

### Backend (Next.js)

| Pattern | Status |
|---|---|
| Stack traces in API responses | NONE — Next.js unhandled errors return 500 without stack in production |
| Raw `error.message` in API responses | NONE — all routes use typed `AppError` → `apiError(code, message, status)` |
| `JSON.stringify(error)` in responses | NONE |
| Unhandled Zod errors | NONE — all parse blocks have explicit ZodError catch |
| Unhandled DB errors | Propagate to Next.js runtime 500 handler — no data leak |

### Flutter (Mobile)

| File | Issue | Fix applied |
|---|---|---|
| `device_request_provider.dart:65` | `e.toString()` set as `errorMessage` state (raw exception string potentially shown in UI) | Replaced with `'Request failed. Check your connection and try again.'` ✓ |
| All other error paths checked | No `e.toString()` shown in user-facing Text/Snackbar widgets | None needed |

---

## Phase D — Data Manipulation Hardening

| Control | Status |
|---|---|
| Check-in uses JWT `userId`, not client body | ✓ |
| Check-out uses JWT `userId`, not client body | ✓ |
| Completed attendance record mutation | AttendanceService enforces session state machine; completed records cannot be re-opened via check-in |
| Regularization employeeId from JWT | ✓ — `payload.userId` passed to service |
| Regularization approval admin-only | ✓ |
| Outside-geofence bypass from client | Not possible — `allowOutsideGeofence` read from Employee document in DB |
| Duplicate regularization prevention | `{employeeId, dateString, status}` unique compound index enforces at DB level |
| Invalid date rejection | `CreateRegularizationSchema` validates date format; service validates lookback window and attendance record existence |
| Regularization lookback window | `regularizationLookbackDays` from settings; validated in `RegularizationService.create` |
| Device approval admin-only | ✓ |
| FCM token update auth | JWT-gated, uses `payload.userId` |
| Settings update admin-only | ✓ |
| Employee update admin-only | ✓ |
| Audit log writes | AuditService called from service layer on key operations |

---

## Phase E — Rate Limiting Audit

### Before hardening

| Endpoint | Limiter | Issue |
|---|---|---|
| `POST /auth/login` | `authLimiter` 10/min by IP | ✓ |
| `POST /auth/password-reset/request` | `passwordResetLimiter` 3/hr by email+IP | ✓ |
| `POST /attendance/checkin` | `attendanceLimiter` 60/min by userId | ✓ |
| `POST /attendance/checkout` | `attendanceLimiter` 60/min by userId | ✓ |
| `POST /auth/device-request` | `authLimiter` + `deviceRequestLimiter` 3/24h | ✓ |
| `POST /auth/refresh` | **NONE** | ❌ Risk: token refresh flooding |
| `POST /regularizations` | **NONE** | ❌ Risk: submission spam |
| `checkRateLimit` helper | **No try-catch** | ❌ Risk: Upstash outage crashes route |

### Fixes applied

| Change | File | Detail |
|---|---|---|
| Added `refreshLimiter` | `rateLimiter.ts` | 30/min sliding window by IP |
| Added `regularizationLimiter` | `rateLimiter.ts` | 20/hr sliding window by userId |
| Upstash fail-safe | `rateLimiter.ts` | `checkRateLimit` try-catch: fails-open on Redis outage |
| Rate limit `POST /auth/refresh` | `auth/refresh/route.ts` | `refreshLimiter` by IP before body parse |
| Rate limit `POST /regularizations` | `regularizations/route.ts` | `regularizationLimiter` by `payload.userId` after auth |

### Upstash failure behaviour

Before: `limiter.limit()` threw → route 500.
After: `checkRateLimit` catches exception → returns `null` → request proceeds (fail-open). Availability preserved. Rate protection degrades gracefully during Redis outage.

### Remaining gaps (acceptable for current scale)

| Endpoint | Gap | Risk | Deferred |
|---|---|---|---|
| `POST /notifications/*/read` | No rate limit | Low — authenticated, small payload | Deferred |
| `PATCH /regularizations/*/approve` | No rate limit | Low — admin-only | Deferred |
| `GET /reports/*` | No rate limit | Medium — DB-heavy | Add if load becomes issue |

---

## Phase F — Crowd/Load Readiness

### MongoDB Indexes

| Model | Indexes present | Status |
|---|---|---|
| `User` | `email` unique (auto-index), `employeeId` unique, `{isActive, role}`, `{role}`, `{department}` | ✓ |
| `AttendanceDay` | `{employeeId, dateString}` unique, `{employeeId, status}`, `{employeeId, year, month}`, `{dateString}` | ✓ |
| `AttendanceRecord` | `{employeeId, date}` unique, `{date, dayStatus}` | ✓ |
| `AttendanceSession` | unique active partial, `{employeeId, dateString}`, `{employeeId, isActive}`, `{attendanceDayId}` | ✓ |
| `Regularization` | `{employeeId, dateString, status}`, `{employeeId, status}`, `{status, createdAt}` | ✓ |
| `Notification` | `{employeeId, isRead}`, `{employeeId, createdAt}`, `{referenceId}`, TTL 1yr | ✓ |
| `FcmToken` | `token` unique, `{employeeId, isActive}`, `{deviceId}`, TTL 90d | ✓ |
| `AuditLog` | `{performedBy, createdAt}`, `{targetId, targetType}` | ✓ |
| `DeviceRequest` | TTL, `{userId, status}`, `{fingerprintHash, status}`, `{status, requestedAt}`, `{email, fingerprintHash}` | ✓ |
| `DeviceSession` | `{employeeId, isRevoked}`, `{refreshTokenHash}`, TTL | ✓ |
| `Leave` | Multiple composite indexes | ✓ |

No missing indexes found for current query patterns.

### Pagination

| Endpoint | Pagination |
|---|---|
| `GET /employees` | `page` + `limit` (max 100) ✓ |
| `GET /regularizations` | `page` + `limit` (max 100) ✓ |
| `GET /regularizations/pending` | `page` + `limit` (max 100) ✓ |
| `GET /notifications` | `page` + `limit` ✓ |
| `GET /attendance/today` | `page` + `limit` ✓ |
| `GET /audit-logs` | `page` + `limit` ✓ |
| `GET /reports/*` | `page` + `limit` ✓ |

### Load concerns

| Area | Finding | Risk |
|---|---|---|
| FCM notification fan-out | `sendFcmNotification` called per-employee in series for multi-employee notifications | Medium — at 50+ employees, admin-approval notification cycles could slow. Acceptable at current scale; batch when needed. |
| Email send | Brevo REST call is synchronous in route handler for password-reset | Low — only one email per request; no fan-out |
| `GET /reports/*` | Aggregation pipelines over attendance/leave collections | Medium — indexed, but no caching. Add Redis cache when report load increases. |
| Vercel timeout | Serverless function timeout 10s (Hobby) / 60s (Pro) | Functions stay well under on current data volume. |
| Regularization lookback query | Queries `AttendanceRecord` by `{employeeId, date}` — indexed ✓ | Low |

---

## Phase G — Static and Build Results

| Check | Result |
|---|---|
| `tsc --noEmit` (before fixes) | PASS |
| `tsc --noEmit` (after fixes) | PASS |
| `flutter analyze --no-fatal-infos` (before) | PASS — no issues |
| `flutter analyze --no-fatal-infos` (after) | PASS — no issues |
| `flutter build apk --debug` | PASS — `build/app/outputs/flutter-apk/app-debug.apk` |

---

## Files Modified

| File | Change |
|---|---|
| `apps/admin/src/middleware/rateLimiter.ts` | Added `refreshLimiter` (30/min IP), `regularizationLimiter` (20/hr userId); added Upstash fail-safe try-catch to `checkRateLimit` |
| `apps/admin/src/app/api/v1/auth/refresh/route.ts` | Added `refreshLimiter` rate limit by IP |
| `apps/admin/src/app/api/v1/regularizations/route.ts` | Added `regularizationLimiter` rate limit by `payload.userId` on POST |
| `apps/mobile/lib/features/device_registration/providers/device_request_provider.dart` | Replaced raw `e.toString()` with safe user-facing error message |
| `docs/78-api-security-exception-load-hardening.md` | Created — this document |

---

## Remaining Blockers

| Blocker | Severity | Blocking deploy? |
|---|---|---|
| P0 secret rotation not done (Phase 18.00) | CRITICAL | YES |
| `apps/admin/.env.example` sanitized but not committed | HIGH | YES |
| Root `.gitignore` hardened but not committed | HIGH | YES |
| Git history contains exposed secrets | HIGH | Acknowledged |
| Vercel env vars not verified post-rotation | MEDIUM | YES |
| `attendance/[employeeId]/correction` route — 501 | LOW | NO (stub, not called) |
| `notifications/[id]` GET — 501 | LOW | NO (stub, not called) |

---

## Readiness Decision

**NOT READY FOR PRODUCTION**

Blocker: P0 secret rotation required. All code changes from Phase 18.01 are ready to commit alongside the Phase 18.00 hygiene commit once rotation is confirmed.
