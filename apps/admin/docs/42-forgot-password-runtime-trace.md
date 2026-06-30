# Phase 15.19 — Forgot Password Runtime Trace

**Date:** 2026-06-29  
**Phase:** 15.19  
**Status:** INSTRUMENTED — awaiting runtime test output

---

## Observed Behaviour

- Mobile app opens Forgot Password screen.
- Email entered.
- UI navigates back to Login screen.
- No reset email received.

---

## Files Instrumented

### Mobile

| File | What was added |
|------|---------------|
| `lib/features/auth/presentation/screens/forgot_password_screen.dart` | Print at button press, email mask, validation result, before/after `repo.forgotPassword()`, `_sent=true` state, catch branch with type+stack, "Back to Sign In" navigation |
| `lib/features/auth/data/sources/auth_remote_source.dart` | Print entry with masked email, full URL, response status+body, throw with stack |

### Backend (Next.js — logcat via `next dev` stdout)

| File | What was added |
|------|---------------|
| `src/app/api/v1/auth/password-reset/request/route.ts` | Rate limit check results (success, remaining, reset timestamp) for BOTH email and IP keys; early-return reason; before/after `AuthService.requestPasswordReset()` |
| `src/services/AuthService.ts` | User lookup result; token generation details (hash prefix, expiresAt); token DB save (_id); `NEXT_PUBLIC_APP_URL` env value; `appUrl`; full `resetUrl`; Brevo env vars present/absent; before/after `sendEmail()` |
| `src/lib/email/brevo.ts` | Sender email+name; API key prefix (first 12 chars); htmlContent byte count; HTTP status from Brevo; full Brevo response body; `messageId` on success; full error body on failure; network-level fetch errors |

---

## Log Prefixes

| Prefix | Layer |
|--------|-------|
| `[DIAG][FP-UI]` | `ForgotPasswordScreen._submit()` |
| `[DIAG][FP-NAV]` | Navigation ("Back to Sign In" tap) |
| `[DIAG][FP-SRC]` | `AuthRemoteSource.forgotPassword()` |
| `[DIAG][FP-ROUTE]` | Next.js route handler |
| `[DIAG][FP-SVC]` | `AuthService.requestPasswordReset()` |
| `[DIAG][BREVO]` | `sendEmail()` in `brevo.ts` |
| (inherited) `[DIAG][REQ/RES/ERR]` | Dio interceptor (from Phase 15.18) |

---

## Pre-Analysis: Known Silence Points

Before instrumentation, every error path in this flow was silently swallowed:

| Layer | Silence mechanism |
|-------|-----------------|
| `forgot_password_screen.dart` `catch (_)` | All exceptions become "Too many requests. Wait 1 hour." in UI — type never logged |
| `password-reset/request/route.ts` `catch` | `AuthService` exceptions swallowed, always 200 |
| `AuthService.requestPasswordReset()` inner `try/catch` | Brevo errors swallowed, always returns |
| Rate limit exceeded | Returns `success(ALWAYS_OK)` — identical to success |
| `brevo.ts` throws | Thrown, but caught two levels up |

Result: mobile always sees HTTP 200, `_sent = true`, shows SuccessView. No signal of failure at any layer.

---

## Navigation Analysis

The "UI returns to Login" is the **expected success-path navigation**, not a bug:

```
_submit() → repo.forgotPassword() → HTTP 200 (always)
  → _sent = true → SuccessView shown
  → user reads "Check Your Email"
  → user taps "Back to Sign In"
  → context.pop()
  → LoginScreen
```

This navigation is **confirmed intentional**. The actual question is whether the backend triggered Brevo and whether Brevo delivered.

---

## Decision Tree for Runtime Output

### Step 1: Was the HTTP request sent?

Look for:
```
[DIAG][FP-SRC] POST http://<host>/api/v1/auth/password-reset/request
[DIAG][REQ]  ▶ POST http://<host>/api/v1/auth/password-reset/request
```

If absent → Dio threw before request was sent (network error, base URL wrong).

If `[DIAG][FP-SRC] forgotPassword() threw:` appears → DioException, check type:
- `connectionTimeout` / `connectionError` → wrong base URL (localhost on device)
- `badResponse` → server returned non-2xx (unlikely — route always 200)

---

### Step 2: What HTTP status was returned?

```
[DIAG][FP-SRC] forgotPassword() response status=200  body={...}
[DIAG][RES]  ◀ HTTP 200 /api/v1/auth/password-reset/request
```

Route always returns 200. If 429 → rate limiter (`checkRateLimit`) is separate from `passwordResetLimiter` — not used on this route. If 500 → unhandled exception in route.

---

### Step 3: Did the rate limit pass?

In Next.js stdout:
```
[DIAG][FP-ROUTE] emailLimit: success=true  remaining=2  reset=2026-...
[DIAG][FP-ROUTE] ipLimit:    success=true  remaining=2  reset=2026-...
```

If either shows `success=false`:
```
[DIAG][FP-ROUTE] Rate limit exceeded → ALWAYS_OK (no token created, no email sent)
```
→ **Email was never sent. Counter was consumed by previous attempts.**  
Rate: `passwordResetLimiter = slidingWindow(3, '1h')` — 3 requests per email AND per IP per hour.

---

### Step 4: Was the user found in DB?

```
[DIAG][FP-SVC] User found: userId=... firstName=...
```

vs:
```
[DIAG][FP-SVC] User not found → returning early (enumeration prevention)
```

If user not found → no token created, no email sent, silently 200.

---

### Step 5: Was the token created?

```
[DIAG][FP-SVC] PasswordResetToken saved. _id=...
```

If not present → DB error (connection, validation). Would appear as:
```
[DIAG][FP-ROUTE] AuthService.requestPasswordReset() threw (swallowed): ...
```

---

### Step 6: Was the reset URL correct?

```
[DIAG][FP-SVC] NEXT_PUBLIC_APP_URL env = https://your-app.vercel.app   ← PLACEHOLDER
[DIAG][FP-SVC] appUrl = https://your-app.vercel.app
[DIAG][FP-SVC] resetUrl = https://your-app.vercel.app/reset-password?token=...&email=...
```

**If `NEXT_PUBLIC_APP_URL` is still the placeholder `https://your-app.vercel.app`** — the email is sent with a non-functional reset link. Email arrives, but clicking the button fails.

`getAppUrl()` implementation:
```typescript
return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
```

No env var set → `http://localhost:3000` → reset link points to dev machine.

---

### Step 7: Was Brevo called?

```
[DIAG][BREVO] sendEmail() → to=user@example.com  subject="Reset your Genesis Workforce password"
[DIAG][BREVO] Calling https://api.brevo.com/v3/smtp/email
```

If not present → exception thrown before reaching `sendEmail()`.

---

### Step 8: What did Brevo return?

**Success:**
```
[DIAG][BREVO] Brevo HTTP status: 201
[DIAG][BREVO] Brevo accepted. messageId=<201906090826.42697195@smtp-relay.mailin.fr>  response={...}
```

**Auth error (API key invalid):**
```
[DIAG][BREVO] Brevo HTTP status: 401
[DIAG][BREVO] Brevo error 401: {"code":"unauthorized","message":"API key is invalid"}
```

**Sender not verified:**
```
[DIAG][BREVO] Brevo HTTP status: 400
[DIAG][BREVO] Brevo error 400: {"code":"invalid_parameter","message":"Sender not allowed"}
```

**Rate limit (Brevo):**
```
[DIAG][BREVO] Brevo HTTP status: 429
[DIAG][BREVO] Brevo error 429: ...
```

**Network failure (DNS/TLS):**
```
[DIAG][BREVO] fetch() threw (network error): TypeError: fetch failed
```

---

### Step 9: If Brevo accepted — delivery is outside the application

If `messageId` is logged, Brevo accepted responsibility for delivery. At this point:
- Application has no further control over delivery.
- Check spam/junk folder.
- Verify recipient address in Brevo dashboard.
- Verify sender domain is verified in Brevo (SPF/DKIM).

---

## Expected Logs — Full Happy Path

```
[DIAG][FP-UI]    Send Reset Link pressed
[DIAG][FP-UI]    email = john@***
[DIAG][FP-UI]    Validation passed. Setting _loading=true
[DIAG][FP-UI]    Calling repo.forgotPassword()
[DIAG][FP-SRC]   forgotPassword() called  email=john@***
[DIAG][FP-SRC]   POST http://10.0.2.2:3000/api/v1/auth/password-reset/request
[DIAG][REQ]   ▶ POST http://10.0.2.2:3000/api/v1/auth/password-reset/request
[DIAG][REQ]     payload = {email: john@example.com}
--- (Next.js stdout) ---
[DIAG][FP-ROUTE]  POST /password-reset/request  ip=10.0.2.2
[DIAG][FP-ROUTE]  email=john@example.com  checking rate limits...
[DIAG][FP-ROUTE]  emailLimit: success=true  remaining=2  reset=2026-...
[DIAG][FP-ROUTE]  ipLimit:    success=true  remaining=2  reset=2026-...
[DIAG][FP-ROUTE]  Rate limits OK. Calling AuthService.requestPasswordReset()
[DIAG][FP-SVC]    requestPasswordReset() entry  email=john@example.com  ip=10.0.2.2
[DIAG][FP-SVC]    User found: userId=abc123  firstName=John
[DIAG][FP-SVC]    Token generated. tokenHash=a3f92b1c...  expiresAt=2026-06-29T18:00:00.000Z
[DIAG][FP-SVC]    PasswordResetToken saved. _id=def456
[DIAG][FP-SVC]    NEXT_PUBLIC_APP_URL env = http://localhost:3000
[DIAG][FP-SVC]    appUrl = http://localhost:3000
[DIAG][FP-SVC]    resetUrl = http://localhost:3000/reset-password?token=...&email=...
[DIAG][FP-SVC]    Brevo sender: worksbysarvesh@gmail.com / Genesis HR
[DIAG][FP-SVC]    Brevo API key present: true  length: 75
[DIAG][FP-SVC]    Calling sendEmail() to john@example.com
[DIAG][BREVO]     sendEmail() → to=john@example.com  subject="Reset your Genesis Workforce password"
[DIAG][BREVO]     Calling https://api.brevo.com/v3/smtp/email
[DIAG][BREVO]     Brevo HTTP status: 201
[DIAG][BREVO]     Brevo accepted. messageId=<abc123@smtp-relay.mailin.fr>
[DIAG][FP-SVC]    sendEmail() completed without exception
[DIAG][FP-ROUTE]  AuthService.requestPasswordReset() completed
[DIAG][FP-ROUTE]  Returning ALWAYS_OK
--- (mobile) ---
[DIAG][RES]   ◀ HTTP 200 /api/v1/auth/password-reset/request
[DIAG][FP-SRC]   forgotPassword() response status=200  body={success: true, ...}
[DIAG][FP-UI]    repo.forgotPassword() returned (no exception). mounted=true
[DIAG][FP-UI]    Setting _sent=true → showing SuccessView
--- user reads success screen, taps "Back to Sign In" ---
[DIAG][FP-NAV]   Back to Sign In tapped → context.pop()
```

---

## Most Likely Root Causes (Pre-Verified by Source Reading)

| # | Root Cause | Evidence Signal | Probability |
|---|-----------|----------------|-------------|
| 1 | Rate limit exhausted (multiple attempts) | `[DIAG][FP-ROUTE] Rate limit exceeded` | HIGH — `passwordResetLimiter` is 3/h per email AND per IP; both counters consumed even on failed attempts |
| 2 | `NEXT_PUBLIC_APP_URL` is placeholder `https://your-app.vercel.app` | `[DIAG][FP-SVC] NEXT_PUBLIC_APP_URL env = https://your-app.vercel.app` | HIGH — `.env.example` shows this as default value; email sends but reset link is dead |
| 3 | Brevo API key invalid or sender not verified | `[DIAG][BREVO] Brevo error 401` or `400` | MEDIUM — all errors are swallowed; no UI feedback |
| 4 | Base URL `localhost:3000` on physical device | `[DIAG][FP-SRC] forgotPassword() threw: DioException connectionTimeout` | MEDIUM — same as Phase 15.18 login issue |
| 5 | User email not registered | `[DIAG][FP-SVC] User not found` | LOW — enumeration prevention makes this indistinguishable from success |

---

## Database Validation

After running the flow, check directly in MongoDB:

```javascript
// Was a PasswordResetToken created?
db.passwordresettokens.find({ email: "user@example.com" }).sort({ createdAt: -1 }).limit(5)

// Fields to verify:
// - tokenHash: 64-char hex (SHA-256)
// - expiresAt: ~15 min from createdAt
// - isUsed: false
// - ipAddress: request IP (not 'system' — that is invite-only)
```

If no token found → rate limit was hit OR user not found.

---

## Audit Log Evidence

`requestPasswordReset()` does NOT write an AuditLog entry (no `writeAuditLog` call). Only `confirmPasswordReset` writes `AUTH_PASSWORD_SETUP`. So absence of audit entry does not indicate failure.

---

## Email Template Verification

`passwordResetEmailHtml()` is inlined in `AuthService.ts` (not a file template). Content verified:
- Subject: `"Reset your Genesis Workforce password"`
- Header: `Genesis Workforce` (#1d4ed8 blue)
- Body: first name + reset URL as both button and plain-text fallback
- Expiry notice: **"15 minutes"** (matches backend 15-min token)
- Footer: "Never share this link with anyone."
- Reset URL format: `${appUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`

---

## Is Email Sent Async or Sync?

**Synchronous.** `AuthService.requestPasswordReset()` `await`s `sendEmail()` before returning. Route `await`s `AuthService.requestPasswordReset()` before returning `success(ALWAYS_OK)`. Mobile `await`s the Dio POST before setting `_sent = true`.

Consequence: if Brevo is slow, the mobile shows a loading spinner until the email API completes. The user sees the success screen only after Brevo has responded.

---

## Production Readiness Concerns (from Source Analysis)

| Issue | Priority | File |
|-------|----------|------|
| Rate limit counter consumed even when limit is exceeded — subsequent `.limit()` calls decrement the counter even if `success=false` is already known | Design issue | `request/route.ts` line 34–36 |
| `NEXT_PUBLIC_APP_URL` placeholder in `.env.example` — if `.env.local` has the same placeholder, all reset links are broken | P1 blocker | `.env.local`, `app-url.ts` |
| `sendEmail()` errors silently swallowed — no way for ops to know email delivery failed | P2 | `AuthService.ts` |
| Mobile UI says "expires in 1 hour" — backend is 15 minutes | P3 | `forgot_password_screen.dart` line 102 |

---

**Awaiting runtime test.** Run the app and paste logcat + Next.js stdout.
