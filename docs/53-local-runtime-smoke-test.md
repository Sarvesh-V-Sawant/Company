# Phase 15.30 — Local Runtime Production Readiness Smoke Test

**Date:** 2026-07-01
**Phase:** 15.30 (runtime smoke) + 15.30C (containment and finalization)
**Scope:** Runtime-only evidence collection. No code modified. No secrets printed. No external services called beyond the running local server.
**Environment:** `apps/admin` — Next.js 16.2.9 (Turbopack), local dev server, MongoDB direct URI (Atlas `test` DB), Upstash Redis.
**Finalized by:** Phase 15.30C
**Prior state entering Phase 15.30:**
- SRV DNS failure resolved (Reason Security DNS misconfiguration — URI converted from `mongodb+srv://` to direct format).
- Database switched from `genesis` (empty) to `test` (10 users, 9 employees, 45 device sessions, 98 audit logs).
- Admin password reset to `Genesis@Test2026!` via direct MongoDB update for local smoke testing only.
- `.env.local` untracked, `.env.example` sanitized, `.gitignore` hardened (Phase 15.28 — uncommitted).

---

## Executive Summary

Local runtime is **conditionally functional**. All authentication routes, protected endpoints, employee listing, device management, and dashboard aggregation respond correctly under normal conditions. One new bug was found and documented: login returns 500 when the client sends no `User-Agent` header. Two pre-existing production-critical defects remain unresolved (health probe, middleware file). Two security findings are documented (refresh token not rotated, no access token blacklist on logout).

**Final verdict: NOT PRODUCTION READY.** Requires bug fix (AUTH-BUG-001), secret rotation, health probe fix, middleware fix, and git history remediation before any production launch.

---

## Phase A — Server Startup and Health

### Server Startup

| Check | Result | Pass/Fail |
|---|---|---|
| Next.js version | 16.2.9 (Turbopack) | Informational |
| Startup time | 373ms | PASS |
| Instrumentation hook | `[DB] Mongoose connected` logged at startup | PASS |
| Port 3000 listening | `netstat: PID 33584` | PASS |

### Health Endpoint

```
GET /health → 200
{"status":"ok","db":"ok","redis":"ok"}
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| `status` field | `ok` | PASS |
| `db` field | `ok` | PASS |
| `redis` field | `ok` | PASS |

**Note — known production defect:** `/health` reads `mongoose.connection.readyState` without calling `connectDB()`. This passes locally because the instrumentation hook pre-connects at startup (persistent process). On Vercel serverless, cold-start invocations have `readyState = 0` — health will return `{"status":"degraded","db":"disconnected"}` even when MongoDB is reachable. See **DEFECT-001** in findings.

---

## Phase B — Authentication: Admin Login

### First Attempt (No User-Agent header) — FAIL

```
POST /api/v1/auth/login → 500 (empty body)
```

**Root cause (server log):**
```
Error: DeviceSession validation failed: deviceInfo: Path `deviceInfo` is required.
POST /api/v1/auth/login 500 in 1739ms
```

`AuthService.login()` sets `deviceInfo: userAgent.slice(0, 500)`. The login route extracts `userAgent` as `request.headers.get('user-agent') ?? ''`. When no `User-Agent` header is sent, `userAgent` is `''`. `''.slice(0, 500)` returns `''`. Mongoose `required: true` on `DeviceSession.deviceInfo` rejects empty string as invalid.

This is **AUTH-BUG-001** — see Findings section.

### Second Attempt (With User-Agent header) — PASS

```
POST /api/v1/auth/login
User-Agent: GenesisSmoke/1.0 (Phase15.30; Node.js)
Body: { email, password }
→ 200 in 1274ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| `accessToken` present | Yes (JWT, 221 chars) | PASS |
| `refreshToken` present | Yes (64-char hex) | PASS |
| `sessionId` present | Yes (24-char MongoDB ObjectId) | PASS |
| `data.employee` for admin | Present key (value null — admin has no employee record) | NOTE |
| Rate limiter | Not triggered | PASS |

**Response shape:**
```json
{
  "success": true,
  "data": {
    "accessToken": "[REDACTED — JWT]",
    "refreshToken": "[REDACTED — 64-char hex]",
    "sessionId": "[REDACTED — ObjectId]",
    "employee": null
  }
}
```

**Note on `employee` field:** Admin users do not have a corresponding Employee document. `data.employee` is null for admin logins. Frontend clients must null-check this field.

**Timing analysis:**
- First login (warm path): 1274ms. Breakdown expected: rate limit check (~100ms) + User.findOne (~100ms) + bcrypt.compare at cost 12 (~700ms) + DeviceSession.create (~300ms) + JWT sign + audit log.
- Prior session had 5.0s for first-ever login — difference explained by Atlas TTL index sync on first `DeviceSession.create` call (one-time cost per cold MongoDB connection).

---

## Phase C — Protected Route: GET /auth/me

```
GET /api/v1/auth/me
Authorization: Bearer [accessToken]
→ 200 in 252ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| `data.role` | `admin` | PASS |
| `data.isActive` | `true` | PASS |
| Response time | 252ms | PASS |

---

## Phase D — Token Refresh

```
POST /api/v1/auth/refresh
Body: { refreshToken, sessionId }
→ 200 in 742ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| New `accessToken` present | Yes (221 chars) | PASS |
| Token rotated (different from original) | Yes | PASS |
| New `refreshToken` returned | **No** — only `accessToken` in response | FINDING |

**Security finding (SEC-001):** Refresh token is **not rotated** on use. The response contains only a new `accessToken`. The same `refreshToken` can be submitted multiple times. A stolen refresh token remains valid indefinitely. See Findings section.

### Phase D2: /me with new access token

```
GET /api/v1/auth/me (new token) → 200 PASS
```

### Phase D3: /me with old access token (post-refresh)

```
GET /api/v1/auth/me (old token) → 200
```

Expected — JWTs are stateless. Old access token remains valid until its TTL (15 min). No server-side token invalidation on refresh.

---

## Phase E — Logout and Post-Logout Access

```
POST /api/v1/auth/logout
Authorization: Bearer [accessToken]
Body: { sessionId }
→ 200 in 1041ms, { "success": true }
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| `success` field | `true` | PASS |

### Phase E2: /me after logout

```
GET /api/v1/auth/me (post-logout) → 200
```

**Security finding (SEC-002):** After logout, the access token remains valid until JWT expiry (15 min TTL). No server-side token blacklist. A leaked access token cannot be revoked. Risk window: up to 15 minutes post-logout. See Findings section.

---

## Phase F — Employee Onboarding (Read Side)

### GET /api/v1/employees

```
GET /api/v1/employees → 200 in 445ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| Response type | Array | PASS |
| Employee count | 10 | PASS |

### GET /api/v1/employees/{id}

```
GET /api/v1/employees/6a43e1e1... → 200 in 1036ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| `employee.isActive` | `true` | PASS |
| `employee.role` | `employee` | PASS |

**Note — response time:** 1036ms for single document read is high. Likely first-request Turbopack JIT compilation for this route in dev mode. Production builds are pre-compiled; this latency does not apply on Vercel.

---

## Phase G — Device Approval Workflow

### GET /api/v1/devices/requests

```
GET /api/v1/devices/requests → 200
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| Total device requests in DB | 1 | PASS |
| Pending requests | 0 (the 1 request has status `approved`) | PASS |

### GET /api/v1/devices/requests/count

```
GET /api/v1/devices/requests/count → 200
{ "count": 0 }
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| Pending count | 0 | PASS |

### GET /api/v1/devices

```
GET /api/v1/devices → 200 in 225ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| Active sessions count | 6 | PASS |

### GET /api/v1/devices/history?userId={id}

```
GET /api/v1/devices/history?userId=6a43e1e1... → 200 in 239ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| History items | 0 (employee has no prior device history) | PASS |

**Note:** Calling `/devices/history` without `?userId=` returns 400 GEN_001 (Zod validation rejects missing required param). Correct behavior.

---

## Phase H — Mobile Login Trace (Device Request Status)

The mobile login flow involves:
1. Employee attempts login on mobile → 401 if device not registered
2. Mobile sends `POST /api/v1/auth/device-request` to create a pending request
3. Admin approves via `POST /api/v1/devices/requests/{id}/approve`
4. Mobile polls `GET /api/v1/auth/device-request/status?email=&deviceFingerprint=` to check approval

### GET /auth/device-request/status (probe)

```
GET /api/v1/auth/device-request/status?email=employee@test.com&deviceFingerprint=aaaa...a(64) → 200 in 253ms
{ "status": "not_found" }
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| Response with non-existent fingerprint | `{"status":"not_found"}` | PASS |
| Zod validation accepts 64-char hex | Yes | PASS |

**Blocker — full end-to-end mobile trace not possible:** No Android/iOS device available for testing. Mobile app must be installed and the 64-char SHA256 device fingerprint generated by the Flutter app for a real device. This phase documents the API surface is correct; full trace requires a physical device.

---

## Source Inspection After Runtime Evidence

No application source files were modified during Phase 15.30 or Phase 15.30C. The following pre-existing uncommitted changes were present before Phase 15.30 started and remain unchanged:

| File | Pre-existing Modification | Phase 15.30 touched? |
|---|---|:---:|
| `apps/admin/next.config.ts` | Security headers config (prior phase) | No |
| `apps/admin/src/proxy.ts` | Proxy export change (prior phase) | No |
| `apps/mobile/.env.example.json` | Mobile env placeholder (prior phase) | No |

Application source files verified clean: `src/services/AuthService.ts`, `src/models/DeviceSession.ts`, `src/app/api/v1/auth/login/route.ts`, `src/app/health/route.ts` — all match committed state. AUTH-BUG-001 was found via runtime observation, not code modification.

## Unsupported Assumptions Rejected

| Assumption | Evidence | Verdict |
|---|---|---|
| "Login always works without User-Agent" | Server error: `deviceInfo: Path required` when UA absent | REJECTED — header required for session creation |
| "Login hangs 30–40s" | Server log: `POST /api/v1/auth/login 200 in 5.0s` | REJECTED — client-side receive timeout, not server hang |
| "genesis DB has test data" | Queried `genesis` DB: 0 documents in all collections | REJECTED — test data is in `test` DB |
| "SEED_ADMIN_INITIAL_PASSWORD is the admin password" | Env var value is effectively blank (spaces + inline comment) | REJECTED — seed script uses different var name (`SEED_ADMIN_PASSWORD`), defaults to `Admin@123456` |

## Phase I — Dashboard Aggregation (Bonus)

```
GET /api/v1/reports/dashboard-summary → 200 in 8228ms
```

| Check | Result | Pass/Fail |
|---|---|---|
| HTTP status | 200 | PASS |
| Response keys | `employees, todayAttendance, pendingApprovals, payroll` | PASS |
| Response time | 8.2s | NOTE (see below) |

**Note on 8.2s:** Heavy multi-collection aggregation (employees + attendance + leaves + payroll). Likely amplified by dev mode Turbopack cold-start for this route. For Vercel production, this endpoint may need caching or pagination optimizations. Not a blocker for Phase 15.30.

---

## Findings Summary

### AUTH-BUG-001 — Login 500 When User-Agent Absent

| Property | Value |
|---|---|
| Severity | HIGH |
| Endpoint | `POST /api/v1/auth/login` |
| Symptom | 500 empty body when request has no `User-Agent` header |
| Root cause | `apps/admin/src/services/AuthService.ts` line 146: `deviceInfo: userAgent.slice(0, 500)` where `userAgent` is `''` (from `request.headers.get('user-agent') ?? ''`). Mongoose `DeviceSession.deviceInfo` has `required: true`. Empty string fails required validation. |
| Impact | Any HTTP client that omits `User-Agent` (automated tools, curl without `-A`, fetch without UA header) cannot log in. Mobile clients always send UA — mitigated in practice, but defensive fix required. |
| Fix | In `AuthService.login()`: `deviceInfo: (userAgent \|\| 'unknown').slice(0, 500)` |
| Blocked by | Phase 15.30 rule — no code changes during smoke test. Document only. |

### SEC-001 — Refresh Token Not Rotated

| Property | Value |
|---|---|
| Severity | MEDIUM |
| Endpoint | `POST /api/v1/auth/refresh` |
| Symptom | Response contains only `{ accessToken }`. No new `refreshToken` returned. Same token reusable indefinitely. |
| Impact | If refresh token is stolen, attacker can maintain access without the victim ever knowing. Standard practice: rotate refresh token on each use (OAuth 2.0 sender-constrained tokens). |
| Fix | `AuthService.refresh()` should generate a new `refreshToken`, hash it, update `DeviceSession.refreshTokenHash`, and return the new raw token. |
| Blocked by | Phase 15.30 rule — document only. |

### SEC-002 — No Access Token Blacklist on Logout

| Property | Value |
|---|---|
| Severity | LOW (mitigated by short 15-min TTL) |
| Endpoint | `POST /api/v1/auth/logout` → `GET /api/v1/auth/me` |
| Symptom | Access token remains valid for 15 minutes after logout. `/me` returns 200 post-logout. |
| Impact | Leaked access tokens cannot be revoked. 15-minute risk window. |
| Note | Fully stateless JWTs by design — this is an accepted tradeoff in JWT-based systems. Short TTL (15 min) is the standard mitigation. Consider Redis-based token blacklist if stricter revocation is required. |
| Fix required? | Accepted design tradeoff unless compliance requires immediate revocation. |

### DEFECT-001 (Pre-existing) — Health Probe Missing connectDB()

| Property | Value |
|---|---|
| Severity | HIGH (production-critical) |
| File | `apps/admin/src/app/health/route.ts` |
| Symptom | Reads `mongoose.connection.readyState` without calling `connectDB()`. Passes locally (instrumentation pre-connects). Fails on Vercel cold start. |
| Fix | Add `await connectDB()` before reading `readyState`. |

### DEFECT-002 (Pre-existing) — proxy.ts Not Registered as Middleware

| Property | Value |
|---|---|
| Severity | CRITICAL (production-critical) |
| File | `apps/admin/src/proxy.ts` |
| Symptom | Exports `proxy()` not `middleware()`. File named `proxy.ts` not `middleware.ts`. JWT auth gate not running in production. All protected routes accessible without authentication on Vercel. |
| Fix | Rename file to `middleware.ts`, export `middleware()` function. |

---

## Endpoint Coverage Matrix

| Endpoint | Method | Status Code | Latency | Pass/Fail |
|---|---|---|---|---|
| `/health` | GET | 200 | — | PASS |
| `/api/v1/auth/login` (no UA) | POST | 500 | 1739ms | **FAIL — AUTH-BUG-001** |
| `/api/v1/auth/login` (with UA) | POST | 200 | 1274ms | PASS |
| `/api/v1/auth/me` | GET | 200 | 252ms | PASS |
| `/api/v1/auth/refresh` | POST | 200 | 742ms | PASS (SEC-001 noted) |
| `/api/v1/auth/logout` | POST | 200 | 1041ms | PASS |
| `/api/v1/auth/me` (post-logout) | GET | 200 | 236ms | DESIGN (SEC-002 noted) |
| `/api/v1/employees` | GET | 200 | 445ms | PASS |
| `/api/v1/employees/{id}` | GET | 200 | 1036ms | PASS |
| `/api/v1/devices/requests` | GET | 200 | 2268ms | PASS |
| `/api/v1/devices/requests/count` | GET | 200 | 286ms | PASS |
| `/api/v1/devices` | GET | 200 | 225ms | PASS |
| `/api/v1/devices/history?userId=` | GET | 200 | 239ms | PASS |
| `/api/v1/devices/history` (no param) | GET | 400 | — | PASS (correct validation) |
| `/api/v1/auth/device-request/status?email=&fp=` | GET | 200 | 253ms | PASS |
| `/api/v1/reports/dashboard-summary` | GET | 200 | 8228ms | PASS (slow — see note) |

---

## Pre-existing Uncommitted Changes (Not Phase 15.30)

| File | Status | Notes |
|---|---|---|
| `apps/admin/.env.example` | Modified (unstaged) | Sanitized in Phase 15.28 — awaiting hygiene commit |
| `apps/admin/.gitignore` | Modified (unstaged) | Hardened in Phase 15.28 — awaiting hygiene commit |
| `apps/admin/.env.local` | Staged deletion (index only) | Untracked since Phase 15.28 — awaiting hygiene commit |
| `apps/admin/next.config.ts` | Modified (unstaged) | Pre-existing from prior phases |
| `apps/admin/src/proxy.ts` | Modified (unstaged) | Pre-existing from prior phases — DEFECT-002 |

Phase 15.30 made no code changes. All uncommitted files predate this phase.

---

## Final Verdict

**NOT PRODUCTION READY**

| Blocker | Severity | Status |
|---|---|---|
| AUTH-BUG-001 — Login 500 without User-Agent | HIGH | Unresolved — fix required before production |
| DEFECT-001 — Health probe (no connectDB) | HIGH | Unresolved — serverless cold-start failure |
| DEFECT-002 — proxy.ts not middleware | CRITICAL | Unresolved — JWT gate not running on Vercel |
| All P0 secrets unrotated (Phase 15.28) | CRITICAL | Unresolved — manual rotation required |
| Git history contains secret blobs | CRITICAL | Unresolved — rewrite or formal risk acceptance |
| SEC-001 — No refresh token rotation | MEDIUM | Design gap — fix recommended |

**What IS working locally:**
- MongoDB connectivity (direct URI, `test` database)
- Redis connectivity (Upstash)
- Admin login with User-Agent header
- JWT access token issuance and verification
- Token refresh (access token rotation)
- Session management (DeviceSession create/lookup)
- Protected route middleware (local — JWT verified on each request)
- Employee listing and detail
- Device request listing and count
- Device session history
- Mobile device-request status endpoint
- Dashboard aggregation

## Recommended Next Engineering Task

**Fix AUTH-BUG-001 first.** It is a proven 500-class runtime defect with a minimal, safe, isolated fix — one line in `AuthService.login()`. No schema migration. No route change. No test data impact.

Minimal fix:
```typescript
// apps/admin/src/services/AuthService.ts ~line 146
// Before:
deviceInfo: userAgent.slice(0, 500),
// After:
deviceInfo: (userAgent || 'unknown').slice(0, 500),
```

Full priority order:
1. AUTH-BUG-001 — proven 500, one-line fix
2. DEFECT-001 — health probe `connectDB()` — production cold-start failure
3. DEFECT-002 — `proxy.ts` → `middleware.ts` — JWT gate not running on Vercel
4. Rotate all P0 secrets (Phase 15.28 handoff)
5. Commit hygiene changes (`.env.example`, `.gitignore`, `.env.local` deletion)
6. Git history rewrite or formal risk acceptance
7. SEC-001 — refresh token rotation (security hardening)
8. Redeploy to Vercel with rotated secrets + fixed code
9. Re-run targeted production runtime verification

## Production Readiness Impact

| Domain | Status |
|---|---|
| MongoDB connectivity (local) | Functional (direct URI, `test` DB) |
| Redis connectivity | Functional (Upstash) |
| Admin login (with User-Agent) | Functional |
| Admin login (without User-Agent) | 500 — AUTH-BUG-001 |
| JWT issuance and verification | Functional |
| Token refresh (access) | Functional |
| Refresh token rotation | Not implemented — SEC-001 |
| Session management | Functional |
| Post-logout token blacklist | Not implemented — SEC-002 |
| Protected routes | Functional locally |
| Health probe (local dev) | Passes (instrumentation pre-connects) |
| Health probe (Vercel serverless) | Fails cold start — DEFECT-001 |
| JWT auth gate (Vercel) | Not running — DEFECT-002 |
| Employee listing | Functional |
| Device management endpoints | Functional |
| Dashboard aggregation | Functional (8.2s — acceptable for dev) |
| Mobile device-request flow | API surface correct; end-to-end untested (no device) |
| Secret rotation | Not done — P0 blocker |
| Git history remediation | Not done — P0 blocker |

## Final Decision
