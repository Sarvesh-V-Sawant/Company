# Phase 15.34 — Page Route Middleware / Proxy Registration Verification and Fix

**Date:** 2026-07-02
**Scope:** Runtime-first, evidence-only. No code modified.
**Prior concern:** DEFECT-002 — Phase 15.33 classified proxy not registered based on middleware manifest showing `"middleware": {}`.

---

## Executive Summary

`proxy.ts` is **correctly registered and actively running** in Next.js 16. All protected admin page routes return `307 → /login` for unauthenticated requests. The middleware manifest key `"middleware": {}` is a legacy internal schema name — Next.js 16 retained the internal manifest format even after renaming the feature from "Middleware" to "Proxy". This manifest key does not reflect whether `proxy.ts` is actually running.

**DEFECT-002 from Phase 15.33 is retracted.** The diagnosis was based on incorrect interpretation of the manifest. No code fix was required or applied.

**Unsupported assumption rejected:** "proxy.ts exported as `proxy()` is wrong — it should be `middleware()`." This is false for Next.js 16.

---

## Precheck and Process Safety

| Check | Result | Pass/Fail |
|---|---|---|
| Dev server | PID 428 on port 3000, responsive — reused from Phase 15.33 | PASS |
| `.env.local` exists | Yes | PASS |
| `.env.local` gitignored | Yes | PASS |
| `.env.local` staged deletion | `D  apps/admin/.env.local` | PASS |
| Expected source changes | `AuthService.ts` (15.31), `health/route.ts` (15.32), `proxy.ts` (pre-15.30) | PASS |
| Unexpected source changes | None | PASS |

---

## Installed Next.js Convention Evidence

| Evidence Source | Finding | Implication |
|---|---|---|
| `package.json` | `"next": "16.2.9"` | Next.js 16 — breaking changes from prior versions |
| `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` | "Starting with Next.js 16, Middleware is now called Proxy to better reflect its purpose." | `proxy.ts` is the correct filename in Next.js 16 |
| Same doc, Convention section | "Create a `proxy.ts` (or `.js`) file in the project root, or inside `src` if applicable" | File at `src/proxy.ts` is correct location |
| Same doc, Example section | `export function proxy(request: NextRequest)` | Named export `proxy` is correct (not `middleware`) |
| `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` | `proxy.ts` listed as top-level Next.js file convention | Confirmed standard file |
| `src/proxy.ts` | Exports `proxy()`, has `config.matcher`, located at `src/proxy.ts` | Matches all Next.js 16 conventions |
| `.next/dev/server/middleware-manifest.json` | `{"middleware": {}, "sortedMiddleware": []}` | Legacy internal key name — does NOT indicate proxy is absent |
| Runtime — protected pages | All 10 protected admin pages → `307 /login` without token | Proxy IS running despite manifest key |
| `no middleware.ts` | No `middleware.ts` exists in `src/` | Correct — Next.js 16 does not expect this file |

---

## Pre-Fix Page Route Runtime Evidence

Server: Next.js 16.2.9 + Turbopack, Atlas `test` DB, PID 428. No auth token. No cookies.

| Route | Expected | Status | Redirect | Body Summary | Pass/Fail |
|---|---|---|---|---|---|
| `/login` | Public | 200 | — | contains /login reference | PASS |
| `/forgot-password` | Public | 200 | — | contains /login reference | PASS |
| `/reset-password` | Public | 200 | — | admin app shell (note below) | PASS |
| `/` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/dashboard` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/employees` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/attendance` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/leave` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/payroll` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/reports` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/notifications` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/settings` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |
| `/devices` | Protected → redirect | 307 | `/login` | contains /login reference | PASS |

**Unprotected admin pages: 0**

Note on `/reset-password`: body classification showed "admin app shell" due to detection heuristics — `proxy.ts` includes `/reset-password` in `PUBLIC_PATHS`, so it intentionally passes through. The response is the reset-password page served correctly. This is expected behavior.

Root redirect chain confirmed: `GET /` → `307 /login` → `200 /login page`.

---

## API Auth Regression Baseline

| Route | Auth State | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| `/api/v1/auth/me` | No token | 401 AUTH_003 | 401 AUTH_003 | PASS |
| `/api/v1/employees` | No token | 401 AUTH_003 | 401 AUTH_003 | PASS |
| `/api/v1/reports/dashboard-summary` | No token | 401 AUTH_003 | 401 AUTH_003 | PASS |
| `/api/v1/devices/requests` | No token | 401 AUTH_003 | 401 AUTH_003 | PASS |
| `/health` | None | 200 db=ok redis=ok | 200 db=ok redis=ok | PASS |
| `/api/v1/auth/login` | Wrong password | 401 AUTH_001 | 401 AUTH_001 | PASS |
| `/api/v1/auth/me` | Admin token | 200 | 200 | PASS |
| `/api/v1/employees` | Admin token | 200 | 200 | PASS |
| `/api/v1/reports/dashboard-summary` | Admin token | 200 | 200 | PASS |

**Result: 9/9 PASS**

---

## Defect Decision Before Code

**Decision: A — Page-route protection is active; no middleware/proxy fix needed.**

All protected admin pages correctly redirect to `/login` via the running `proxy.ts`. No data served to unauthenticated users. The prior DEFECT-002 classification was based on incorrect interpretation of the middleware manifest internal key format.

---

## Minimal Fix Applied

**None. No code modified.**

Phase F (implementation) was skipped because Phase E decision was A.

---

## Post-Fix Page Route Verification

N/A — no fix applied. Pre-fix verification confirmed correct behavior.

---

## Post-Fix API Auth Regression

N/A — no fix applied. API baseline confirmed 9/9 PASS.

---

## Targeted Test Evidence

No middleware/proxy test files found (`apps/admin/**/*.test.ts`, `apps/admin/**/*.spec.ts`). Runtime verification used instead.

---

## Files Modified

None.

---

## Risk

No code changed. Zero risk in this phase.

---

## Regression Risk

None — no code changed.

---

## Remaining Known Issues

DEFECT-002 is **retracted** — proxy is correctly registered and working.

| ID | Description | Priority | Status |
|---|---|---|---|
| SEC-001 | Refresh token not rotated on use | P1 | Unresolved |
| SEC-002 | No access token blacklist on logout (15-min window) | P2 | Accepted design tradeoff |
| P0 secrets | All production secrets unrotated | P0 | Unresolved |
| Git history | Secret blobs at `5bf3a15`, `9b941a9` | P0 | Unresolved |
| Mobile login | Mobile client login issue unresolved | P1 | Unresolved |
| Vercel verification | Production env/log verification incomplete | P0 | Unresolved |
| Employee role test | Employee role runtime testing not performed (no credentials) | P2 | Pending UAT |

---

## Production Readiness Impact

The page-route protection gap identified in Phase 15.33 does not exist. Admin dashboard pages are correctly protected. This removes one blocker from the production readiness list.

All prior auth/health fixes (AUTH-BUG-001, DEFECT-001) remain in place and verified.

**Production readiness: NOT READY** — remaining blockers: unrotated P0 secrets, unremediated git history, incomplete Vercel production verification, mobile login unresolved.

---

## Final Decision

**Decision: A — Page-route protection already works; no code fix applied.**

All 10 protected admin pages redirect to `/login` for unauthenticated users. `proxy.ts` is correctly registered per Next.js 16 convention. Middleware manifest `"middleware": {}` is a legacy internal key that does not indicate absence of proxy registration in Next.js 16.

Phase 15.34 is complete. No code was modified. DEFECT-002 is retracted.
