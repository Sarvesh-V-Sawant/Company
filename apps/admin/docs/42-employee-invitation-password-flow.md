# Phase 15.19 — Employee Invitation & Password Setup Flow Analysis

**Date:** 2026-06-28  
**Phase:** 15.19 (Investigation — no code changes)  
**Status:** Root cause identified. Two defects confirmed. Fixes specified.

---

## 1. Runtime Evidence

**Reproduced:** Employee created → Brevo sends welcome email → "Set Your Password" button in email → URL opens `https://your-app.vercel.app/reset-password?token=...&email=...` → unrelated Vercel placeholder application.

**Observed email URL pattern:**
```
https://your-app.vercel.app/reset-password?token=<64-char-hex>&email=<url-encoded-email>
```

**Expected URL for local development:**
```
http://localhost:3000/reset-password?token=<64-char-hex>&email=<url-encoded-email>
```

---

## 2. Root Cause

**File:** `apps/admin/.env.local` — line 33

```env
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

This is the verbatim placeholder copied from `.env.example` and never replaced with a real URL. It is set — so the fallback in code never fires.

**Invitation URL is built at:** `src/services/EmployeeService.ts:307`

```typescript
const setupUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/reset-password?token=${rawInviteToken}&email=${encodeURIComponent(user.email)}`;
```

Because `NEXT_PUBLIC_APP_URL` is defined (as `https://your-app.vercel.app`), the `?? 'http://localhost:3000'` nullish-coalescing fallback is never evaluated. The placeholder value goes directly into the email.

**Same defect exists for forgot-password emails at:** `src/services/AuthService.ts:207`

```typescript
const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/reset-password?token=...`;
```

The fallback here is `''` (empty string), not localhost — so if `NEXT_PUBLIC_APP_URL` were somehow unset, forgot-password emails would contain a relative path (`/reset-password?...`) which is not a valid URL in an email client.

---

## 3. URL Generation Analysis

Traced from employee creation to email delivery:

| Step | Location | URL Variable |
|------|----------|-------------|
| Invite token generated | `EmployeeService.ts:295-305` | `rawInviteToken` (32-byte hex = 64 chars) |
| Setup URL assembled | `EmployeeService.ts:307` | `process.env.NEXT_PUBLIC_APP_URL + '/reset-password?token=...&email=...'` |
| Email HTML rendered | `EmployeeService.ts:25-73` | `setupUrl` in `welcomeEmailHtml()` |
| Email delivered | `src/lib/email/brevo.ts` | Passed to Brevo REST API as `htmlContent` |

URL appears twice in the email:
1. As the `href` on the "Set Your Password" button
2. In the plain-text fallback block (for clients that block buttons)

---

## 4. Environment Variable Analysis

| Variable | Value in `.env.local` | Expected (dev) | Expected (prod) |
|----------|----------------------|----------------|-----------------|
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` ← **WRONG** | `http://localhost:3000` | `https://yourapp.vercel.app` or custom domain |

**No other URL variables exist in the codebase.** Searched exhaustively:
- `NEXTAUTH_URL` — not present
- `BASE_URL` — not present
- `CLIENT_URL` — not present
- `FRONTEND_URL` — not present
- `APP_URL` — not present

`NEXT_PUBLIC_APP_URL` is the single source of truth for application URL across both invitation and password-reset email flows.

**Why `NEXT_PUBLIC_APP_URL` was set to the placeholder:** `.env.example` contains the placeholder as a documentation hint. The developer copied it to `.env.local` without replacing this specific value (MONGODB_URI, JWT_SECRET, Brevo keys, Redis, Firebase — all were correctly replaced; only `NEXT_PUBLIC_APP_URL` was overlooked).

---

## 5. Invitation Email Analysis

**Template:** `src/services/EmployeeService.ts:25-73` (`welcomeEmailHtml`)

Content audit:

| Element | Present | Correct |
|---------|---------|---------|
| Genesis Workforce branding (blue header) | ✓ | ✓ |
| Employee first name personalization | ✓ | ✓ |
| "Set Your Password" CTA button | ✓ | ✓ |
| 24-hour expiry warning | ✓ | ✓ |
| Plain-text fallback URL | ✓ | ✓ |
| "Never share this link" security notice | ✓ | ✓ |
| No password in email | ✓ | ✓ |
| No employee ID in email | ✓ | ✓ |
| Correct URL in button | ✗ | placeholder domain |
| Correct URL in fallback | ✗ | placeholder domain |

The template itself is production-grade. The only defect is the URL it receives.

**Forgot-password email template** (`AuthService.ts:213`) — minimal inline HTML, not branded. Lower severity since it works correctly after the env fix. Flagged as a UX improvement opportunity (not a blocker).

---

## 6. Password Setup Flow

### Web Flow (Admin Portal — `/reset-password`)

**File:** `src/app/(auth)/reset-password/page.tsx`

**UX: CORRECT per spec.**

The page reads `token` and `email` from URL query parameters. The form shows:
- New Password (with show/hide toggle)
- Confirm Password (with show/hide toggle)
- Inline password requirements (min 8 chars, uppercase, number)
- "Activate Account" submit button

**The employee is NOT asked for email, username, or employee ID.** These are bound from the URL. ✓

**State machine:** `form → submitting → success | error-invalid | error-expired | error-used | no-token`

All states are handled with appropriate UI. Success auto-redirects to `/login` after 3 seconds.

**Backend confirm endpoint:** `POST /api/v1/auth/password-reset/confirm`

Schema (`ResetPasswordSchema`):
```typescript
{ token: string (min 1), email: email, newPassword: string (min 8, max 128) }
```

`AuthService.confirmPasswordReset()` (in transaction):
1. Find most recent unused token for email
2. Check expiry → `AUTH_009` if expired
3. SHA-256 hash provided token, timing-safe compare → `AUTH_008` if mismatch
4. Verify new password ≠ current password (bcrypt.compare)
5. Update `passwordHash`, set `requiresPasswordChange: false`
6. Mark token `isUsed: true`
7. Revoke all active DeviceSessions (`revokedReason: 'admin-reset'`)

All in a single MongoDB transaction. ✓

### Mobile Flow

Mobile router has `/reset-password` route (`app_router.dart:56-59`) that reads `token` and `email` from query params and passes them to `ResetPasswordScreen`. This screen calls `AuthRepository.resetPassword()` → `AuthRemoteSource.resetPassword()` → `POST /api/v1/auth/password-reset/confirm`.

**However:** The invite email links to `https://your-app.vercel.app` (web URL). Mobile deep linking is not configured to intercept this URL and open the app. This is by design — initial password setup is intended to be done via the web browser, ensuring the employee can complete setup even before installing the mobile app. The mobile `ResetPasswordScreen` is for use after the employee clicks "Forgot Password" within the app.

---

## 7. Security Review

| Property | Status | Detail |
|----------|--------|--------|
| Token cryptographic strength | ✓ | `randomBytes(32)` = 256-bit entropy |
| Stored as hash only | ✓ | SHA-256 of raw token; raw token never persisted |
| One-time usage | ✓ | `isUsed: true` set in transaction on confirm |
| Expiry enforced | ✓ | Application check + MongoDB TTL index (`expireAfterSeconds: 0`) |
| Timing-safe comparison | ✓ | `timingSafeEqualHex(providedHash, storedHash)` |
| Replay protection | ✓ | `isUsed` checked before hash comparison; TTL auto-deletes expired |
| All sessions revoked on reset | ✓ | `DeviceSession.updateMany` in same transaction |
| `requiresPasswordChange` cleared | ✓ | Set to `false` in same transaction |
| New password ≠ current password | ✓ | `bcrypt.compare` check in backend |
| Rate limiting | ✓ | `authLimiter` (Upstash Redis) on both `/password-reset/request` and `/password-reset/confirm` |
| Enumeration prevention | ✓ | `/password-reset/request` always returns 200 |
| Password complexity (backend) | ⚠ PARTIAL | Only `min(8)` enforced at API layer via Zod. Uppercase/number requirements exist ONLY in UI (web + mobile). A raw API call with `"aaaaaaaa"` succeeds. |
| Audit log on password setup | ✗ MISSING | `confirmPasswordReset` writes no `AuditLog` entry. Password change via invite token is not auditable. |
| Token lookup scope | ✓ | Looks up by `email` + `isUsed: false`, finds most recent, then hash-compares. Correct — wrong token fails hash check. |

---

## 8. Mobile Verification

### Authentication Source

Single auth backend: `POST /api/v1/auth/login` (same endpoint for web and mobile). ✓

### Mobile `changePassword` — DEFECT FOUND

**`AuthRemoteSource.changePassword()` (`auth_remote_source.dart:44-49`):**
```dart
final response = await _dio.patch(ApiEndpoints.changePassword, data: {'newPassword': newPassword});
```

**Backend `ChangePasswordSchema`:**
```typescript
{ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) }
```

**`currentPassword` is required by the backend but never sent by mobile.** Every call to `PATCH /api/v1/auth/me/change-password` from the mobile app returns:
```json
HTTP 400 { "error": { "code": "GEN_001", "message": "Validation failed." } }
```

Both mobile change-password screens are affected:
- `ChangePasswordScreen` (forced first-login, `RouteNames.changePassword`)
- `ProfileChangePasswordScreen` (voluntary, `RouteNames.profileChangePassword`)

Neither screen has a "Current Password" field in the UI, and neither passes it to the repository.

### Mobile Login Flow

`AuthRepository.login()` → sends `email`, `password`, `deviceFingerprint` (SHA-256 of device identifiers). Backend verifies credentials then device fingerprint. ✓

Employee-role login requires registered device. Admin-role bypasses device check. ✓

### Mobile Forgot Password

`ForgotPasswordScreen` calls `POST /api/v1/auth/password-reset/request`. ✓  
Success message: "Check Your Email" — enumeration-safe. ✓

`ForgotPasswordScreen` error message says "Link expires in 1 hour" but backend generates 15-minute expiry. Minor copy discrepancy.

---

## 9. Production Readiness

| Component | Ready | Blocker |
|-----------|-------|---------|
| Invite token generation | ✓ | — |
| Welcome email content | ✓ | — |
| Brevo delivery | ✓ | — |
| Setup URL in email | ✗ | `NEXT_PUBLIC_APP_URL` placeholder |
| Web reset-password page UX | ✓ | — |
| Password confirm backend | ✓ | — |
| Session revocation on setup | ✓ | — |
| `requiresPasswordChange` cleared | ✓ | — |
| Mobile login after setup | ✓ | — |
| Mobile change-password (profile) | ✗ | Missing `currentPassword` field + API param |
| Audit log for password setup | ✗ | No `AuditLog.create` in `confirmPasswordReset` |
| Backend password complexity | ✗ | Zod only enforces min(8); uppercase/number UI-only |

---

## 10. Missing Components

In priority order:

| Priority | Component | Impact |
|----------|-----------|--------|
| P0 | `NEXT_PUBLIC_APP_URL` set to placeholder | Blocks all email-based onboarding |
| P1 | Mobile `changePassword` missing `currentPassword` | Mobile password change always 400 |
| P1 | `AuthService.requestPasswordReset` fallback is `''` | Relative URL in forgot-password email if env unset |
| P2 | No `AuditLog` in `confirmPasswordReset` | Password setup via invite is not auditable |
| P2 | Backend password complexity | Uppercase/number only UI-enforced; bypassable via API |
| P3 | Forgot-password email not branded | Minimal inline HTML vs. welcome email's full template |
| P3 | Mobile copy: "expires in 1 hour" vs. 15-min actual | Minor UX discrepancy |
| P4 | No resend-invitation endpoint | Expired invite requires forgot-password workaround |
| P4 | No token pre-validation endpoint | User fills form before discovering token is expired |

---

## 11. Exact Files Requiring Changes

| File | Change Required |
|------|----------------|
| `apps/admin/.env.local:33` | `NEXT_PUBLIC_APP_URL=http://localhost:3000` |
| `apps/admin/src/services/AuthService.ts:207` | Fallback `''` → `'http://localhost:3000'` |
| `apps/mobile/lib/features/auth/data/sources/auth_remote_source.dart:44-49` | Add `currentPassword` parameter and include in request body |
| `apps/mobile/lib/features/auth/presentation/screens/change_password_screen.dart` | Add current-password field and pass to provider |
| `apps/mobile/lib/features/profile/presentation/screens/profile_change_password_screen.dart` | Add current-password field and pass to provider |
| `apps/mobile/lib/features/auth/presentation/providers/auth_provider.dart:79-83` | Update `changePassword(String newPassword)` → `changePassword(String currentPassword, String newPassword)` |
| `apps/mobile/lib/features/auth/data/repositories/auth_repository.dart:96-104` | Pass `currentPassword` through to remote source |
| `apps/admin/src/services/AuthService.ts` (`confirmPasswordReset`) | Add `AuditLog.create` for `PASSWORD_SETUP` action |

---

## 12. Minimal Safe Fix

**Fix the reported defect (P0) with one change:**

```env
# apps/admin/.env.local line 33
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

This single change makes invitation emails link to `http://localhost:3000/reset-password?token=...&email=...` in local development, which loads the Next.js app and the password setup page works end-to-end.

No code changes required for the P0 fix.

**Fix the AuthService fallback (companion to P0):**

`src/services/AuthService.ts:207`:
```typescript
// Before
const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/reset-password?...`;

// After
const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/reset-password?...`;
```

**Fix mobile changePassword (P1):**

All mobile change-password screens must collect and send `currentPassword`. Affects 5 files (remote source, repository, provider, 2 screens). The screens need a current-password field added to the UI.

Note: `ChangePasswordScreen` (forced first-login) has copy "Your admin set a temporary password" which is now inaccurate — with the new invite flow, no temporary password is communicated to the employee. This copy should be updated.

---

## 13. Regression Risk

| Change | Risk | Mitigation |
|--------|------|-----------|
| Fix `NEXT_PUBLIC_APP_URL` in `.env.local` | None — env file only, no code | Verify email link after change |
| Fix `AuthService` fallback string | None — fallback only fires when env is unset | Unit test for URL generation |
| Add `currentPassword` to mobile API call | Low — fixes silent 400 errors; adds required UI field | Existing backend test coverage validates both schema fields |
| Add `AuditLog` in `confirmPasswordReset` | Low — append-only write in same transaction scope | Ensure transaction wraps the log write |
| Backend password complexity in Zod schema | Medium — tightens API contract; existing stored passwords not affected | All frontends already enforce this in UI; raw API callers will now get validation errors |

---

## Onboarding Flow Status (post-analysis)

```
Admin creates employee                                    ✓ Working
  ↓
Invite token generated (32-byte random, SHA-256 stored)   ✓ Working
  ↓
Welcome email sent via Brevo                              ✓ Working (email delivered)
  ↓
Invitation URL in email                                   ✗ Wrong domain (NEXT_PUBLIC_APP_URL placeholder)
  ↓ (after env fix)
Employee opens /reset-password?token=...&email=...        ✓ Working (web page correct)
  ↓
Employee sets password (New + Confirm only)               ✓ Working
  ↓
POST /api/v1/auth/password-reset/confirm                  ✓ Working (token validated, sessions revoked)
  ↓
requiresPasswordChange = false                            ✓ Working
  ↓
Employee redirected to /login                             ✓ Working
  ↓
Employee logs in (email + password + device fingerprint)  ✓ Working (after device registered by admin)
  ↓
JWT issued, dashboard loads                               ✓ Working
```

Single blocker for the complete flow: **`NEXT_PUBLIC_APP_URL=http://localhost:3000`** in `.env.local`.
