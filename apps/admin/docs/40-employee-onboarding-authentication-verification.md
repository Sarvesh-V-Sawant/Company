# Phase 15.17 — Employee Onboarding & Authentication Verification

**Date:** 2026-06-28  
**Phase:** 15.17  
**Status:** COMPLETE — Read-only audit, no code changes

## Architecture Verified

### Login Identifier

Employees log in with **email + password**, not `employeeId`. Schema: `LoginSchema` accepts `email`, `password`, optional `deviceFingerprint`.

### Employee-Role Login Requirements

Employee-role users **must** have a registered device. Login without device → `AUTH_004`. Device fingerprint is SHA-256 hashed before storage. Admin-role bypasses device check entirely.

### New Employee State at Creation

| Field | Value |
|-------|-------|
| `requiresPasswordChange` | `true` |
| `registeredDevice` | `null` |
| `passwordHash` | bcrypt hash of unknown random temp password |
| `isActive` | `true` |

### Portal Layout Enforcement

`apps/admin/src/app/(portal)/layout.tsx` redirects to `/change-password` when `user.requiresPasswordChange === true`. This gates all portal pages.

### Authentication Flow (Admin Portal)

1. `POST /api/v1/auth/login` → JWT access token (15 min) + refresh token (30 days, 90-day absolute) + sessionId
2. `POST /api/v1/auth/refresh` → new access token
3. `POST /api/v1/auth/logout` → session revoked

### Password Reset Flow

`POST /api/v1/auth/password-reset/request` → always returns 200 (enumeration prevention). Token stored as SHA-256 hash in `PasswordResetToken` collection (15-min expiry for standard reset).

`POST /api/v1/auth/password-reset/confirm` → validates token hash, updates password, clears `requiresPasswordChange`, revokes all sessions.

Error codes: `AUTH_008` = invalid/used token, `AUTH_009` = expired token.

## Defects Identified (Remediated in Phase 15.18)

| ID | Description | Endpoint |
|----|-------------|----------|
| DEF-ONBOARD-001 | change-password page calls wrong endpoint → 501 | `/api/v1/auth/me` (should be `/api/v1/auth/me/change-password`) |
| DEF-ONBOARD-002 | forgot-password page is a non-functional stub | `/api/v1/auth/password-reset/request` |
| DEF-ONBOARD-003 | reset-password page says "not supported" | `/api/v1/auth/password-reset/confirm` |
| DEF-ONBOARD-004 | No welcome email sent on employee creation | `EmployeeService.create()` |
| DEF-ONBOARD-005 | AuthContext stores `_id` but API returns `id` | `AuthContext.tsx` |

## Runtime Evidence

- `POST /api/v1/auth/login` with `admin@genesis.com` → HTTP 200 with JWT ✓
- `POST /api/v1/employees` → HTTP 201, employee created in MongoDB ✓
- `GET /api/v1/employees/:id` → `requiresPasswordChange: true`, `hasRegisteredDevice: false` ✓
- `POST /api/v1/auth/password-reset/request` → HTTP 200 always ✓
- `POST /api/v1/auth/password-reset/confirm` with invalid token → `AUTH_008` ✓
