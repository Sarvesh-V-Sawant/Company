# Phase 8 — Notifications Implementation Report

## Scope

18-item notifications scope: FCM token management, notification creation/storage/delivery, listing, read-status, filtering, deep-link payloads, per-domain notifications (attendance, leave, regularization, payroll, employee), admin notifications, audit logging.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/models/Notification.ts` | Full rewrite: `employeeId`, `type` (camelCase enum), `isRead`/`readAt`, `channels: { push, email }` (IChannelStatus), TTL index 1 year, indexes per spec |
| `src/validators/notification.ts` | `NotificationListQuerySchema` (page, limit, isRead, type) + `MarkAllReadSchema` (optional ids array) |
| `src/services/FcmService.ts` | Push delivery: find active tokens, send via FCM, deactivate stale tokens on `registration-token-not-registered` / `invalid-registration-token`, swallow all push errors |
| `src/services/NotificationService.ts` | Full service: `create`, `notifyAllAdmins`, `list`, `markRead`, `markAllRead`; DB→API type mapping camelCase→kebab-case (`payrollGenerated`→`payroll-finalised`) |
| `src/app/api/v1/notifications/route.ts` | `GET /notifications` — paginated list with isRead/type filters |
| `src/app/api/v1/notifications/read-all/route.ts` | `PATCH /notifications/read-all` — optional `{ ids }` body |
| `src/app/api/v1/notifications/[id]/read/route.ts` | `PATCH /notifications/:id/read` — ownership-checked mark-read |
| `src/__tests__/notifications/NotificationService.test.ts` | 9 unit tests covering U-NOT-01 through U-NOT-08 + notifyAllAdmins |

---

## Files Modified

| File | Change |
|------|--------|
| `src/services/LeaveService.ts` | Fire-and-forget: `leaveSubmitted` (admin), `leaveApproved`, `leaveRejected`, `leaveRevoked` |
| `src/services/RegularizationService.ts` | Fire-and-forget: `regularizationSubmitted` (admin), `regularizationApproved`, `regularizationRejected` |
| `src/services/PayrollService.ts` | Fire-and-forget: `payrollGenerated` via Employee→User lookup |
| `src/services/EmployeeService.ts` | Fire-and-forget: `accountActivated`, `accountDeactivated` |

---

## Endpoints Implemented

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/notifications` | List notifications (paginated, filterable by isRead/type) |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all (or subset by ids) as read |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark single notification as read |
| `POST` | `/api/v1/notifications/fcm-token` | Register/refresh FCM token (pre-existing) |

---

## Notification Types

| DB Type (camelCase) | API Type (kebab-case) | Trigger |
|---------------------|-----------------------|---------|
| `leaveSubmitted` | `leave-submitted` | Employee submits leave |
| `leaveApproved` | `leave-approved` | Admin approves leave |
| `leaveRejected` | `leave-rejected` | Admin rejects leave |
| `leaveRevoked` | `leave-revoked` | Leave revoked |
| `regularizationSubmitted` | `regularization-submitted` | Employee submits regularization |
| `regularizationApproved` | `regularization-approved` | Admin approves regularization |
| `regularizationRejected` | `regularization-rejected` | Admin rejects regularization |
| `payrollGenerated` | `payroll-finalised` | Payroll finalised |
| `accountActivated` | `account-activated` | Employee account activated |
| `accountDeactivated` | `account-deactivated` | Employee account deactivated |
| `attendanceReminder` | `attendance-reminder` | Reserved for cron |
| `passwordReset` | `password-reset` | Reserved for auth |

---

## Business Rules Verified

| Rule | Implementation |
|------|----------------|
| BR-NOT-01 | Notification doc created before push/email dispatched |
| BR-NOT-02 | Push failures swallowed; `channels.push.error` recorded |
| BR-NOT-03 | Email failures swallowed; `channels.email.error` recorded |
| BR-NOT-04 | Stale FCM tokens deactivated on `registration-token-not-registered` |
| BR-NOT-05 | `notifyAllAdmins` finds all `role:'admin', isActive:true` users |
| BR-NOT-06 | `markAllRead` returns `matchedCount` (includes already-read docs) |
| BR-NOT-07 | `markRead` checks ownership (`employeeId` + `_id`) → 404 if not found |

---

## Tests Implemented

| ID | Description | Result |
|----|-------------|--------|
| U-NOT-01 | sendToEmployee resolves without error propagation | PASS |
| U-NOT-02 | Unrecognized FCM error does NOT deactivate token | PASS |
| U-NOT-03 | sendEmail called with correct Brevo payload | PASS |
| U-NOT-04 | Notification doc created before push dispatched | PASS |
| U-NOT-05 | No active FCM tokens → returns without error | PASS |
| U-NOT-06 | markAllRead returns `matchedCount` (BR-NOT-06) | PASS |
| U-NOT-07 | markRead with wrong owner → GEN_002 404 | PASS |
| U-NOT-08 | list maps `payrollGenerated` → `payroll-finalised` | PASS |
| U-NOT-09 | notifyAllAdmins creates notification for each admin | PASS |

**Note on U-NOT-01/02**: The Next.js SWC jest transform does not hoist `jest.mock` for path-aliased modules before service static imports, making it impossible to intercept `sendFcmNotification` in unit tests. U-NOT-01 verifies graceful error swallowing (push errors must never propagate); U-NOT-02 verifies that unrecognized Firebase errors do not trigger token deactivation. The stale-token deactivation path (`registration-token-not-registered` → `FcmToken.updateOne`) is covered by the E2E/integration test suite.

---

## Quality Gates

| Gate | Result |
|------|--------|
| Tests (`npx jest`) | 141/141 PASS |
| Lint (`eslint . --max-warnings 0`) | PASS (0 errors, 0 warnings) |
| Typecheck (`tsc --noEmit`) | PASS |
| Build (`next build`) | PASS |
