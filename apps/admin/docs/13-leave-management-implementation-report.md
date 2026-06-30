# Phase 5 — Leave Management Implementation Report

## Status: COMPLETE

- Lint: PASS (0 errors)
- Typecheck: PASS (0 errors)
- Build: PASS (clean)
- Leave Tests: 17/17 PASS

---

## Files Created

### Models
- `src/models/Leave.ts` — full rewrite; ILeave interface, LeaveSchema, all indexes
- `src/models/LeaveTransaction.ts` — full rewrite; immutable (pre-hooks on all mutation ops)
- `src/models/LeaveYearAllocation.ts` — full rewrite; immutable except bulkWrite; unique index on (employeeId, leaveYear, leaveType)

### Services
- `src/services/LeaveService.ts` — apply, approve, reject, cancel, revoke, list, listPending, getBalance, getById
- `src/services/LeaveBalanceService.ts` — allocateLeaveYear, processCarryForwardExpiry, creditCarryForward

### Utilities
- `src/lib/utils/leaveUtils.ts` — getLeaveYearBoundaries, dateRange, weekdayOf

### Validators
- `src/validators/leave.ts` — ApplyLeaveSchema, RejectLeaveSchema, RevokeLeaveSchema, LeaveListQuerySchema, LeaveBalanceQuerySchema, LeavePendingQuerySchema

### API Routes
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/v1/leaves` | apply (employee) |
| GET | `/api/v1/leaves` | list (employee own + admin all) |
| GET | `/api/v1/leaves/balance` | balance (employee own, admin by query) |
| GET | `/api/v1/leaves/pending` | pending list (admin only) |
| GET | `/api/v1/leaves/[id]` | single leave |
| PATCH | `/api/v1/leaves/[id]/cancel` | cancel (employee, pending only) |
| PATCH | `/api/v1/leaves/[id]/approve` | approve (admin only) |
| PATCH | `/api/v1/leaves/[id]/reject` | reject (admin only) |
| PATCH | `/api/v1/leaves/[id]/revoke` | revoke (admin only) |

### Cron Routes
- `src/app/admin/cron/leave-year-allocation/route.ts` — annual allocation with SystemEvent idempotency guard
- `src/app/admin/cron/leave-carryforward-expiry/route.ts` — expiry processing with SystemEvent idempotency guard

### Tests
- `src/__tests__/leave/LeaveService.test.ts` — 17 unit tests (U-LVE-01 through U-LVE-17)

---

## Files Modified

- `src/models/CompanySettings.ts` — added ILeaveTypesConfig, ILeaveTypeConfig, ICarryForwardConfig interfaces + schema fields (regularizationLookbackDays, leaveTypes)
- `src/models/index.ts` — added Leave, LeaveTransaction, LeaveYearAllocation exports + type re-exports
- `src/constants/cron-names.ts` — added LEAVE_YEAR_ALLOCATION, LEAVE_CARRYFORWARD_EXPIRY

---

## Key Design Decisions

**apply()** — no balance deduction at apply time; balance deducted only on approve (prevents ghost holds).

**approve()** — atomic balance deduction via `User.findOneAndUpdate` with `$gte` filter on both carriedForward and currentYear; if filter returns null → LVE_001 (race condition protection). carriedForward consumed before currentYear.

**LWP** — no balance check, no deduction/restoration ever. AttendanceDay still updated to 'onLeave'.

**affectedDates** — server-computed; excludes weekends (settings.workingDays) and holidays (Holiday collection).

**Immutable audit trail** — LeaveTransaction and LeaveYearAllocation reject all mutations via Mongoose pre-hooks.

**Carry-forward expiry** — checked at effectiveBalance() call time (not just at cron); expired CF does not count toward available balance.

---

## Test Coverage

| ID | Scenario |
|----|----------|
| U-LVE-01 | apply() with sufficient balance → pending, no deduction |
| U-LVE-02 | apply() with zero balance → LVE_001 |
| U-LVE-03 | apply() with date conflict → LVE_002 |
| U-LVE-04 | apply() on weekend → LVE_004 |
| U-LVE-05 | apply() on holiday → LVE_003 |
| U-LVE-06 | leaveYear computed from startDate + leaveYearStartMonth |
| U-LVE-07 | affectedDates excludes weekends |
| U-LVE-08 | approve() atomic balance deduction |
| U-LVE-09 | approve() carriedForward consumed before currentYear |
| U-LVE-10 | approve() exact balance → 0 without underflow |
| U-LVE-11 | reject() → status rejected, no balance change |
| U-LVE-12 | cancel() pending → cancelled |
| U-LVE-13 | cancel() approved → LVE_007 |
| U-LVE-14 | revoke() → balance restored, AttendanceDay reverted |
| U-LVE-15 | revoke() non-approved → LVE_006 |
| U-LVE-16 | half-day → totalDays = 0.5 |
| U-LVE-17 | LWP → no balance check |

---

## Remaining Tasks

- None for Phase 5.
- Phase 6 (Regularization) not started — awaiting approval.

---

## Error Codes Implemented

| Code | Constant | Trigger |
|------|----------|---------|
| LVE_001 | LEAVE_BALANCE_INSUFFICIENT | balance < requested days (also race condition guard) |
| LVE_002 | LEAVE_DATE_CONFLICT | overlapping approved/pending leave on affectedDates |
| LVE_003 | LEAVE_ON_HOLIDAY | all requested dates are holidays |
| LVE_004 | LEAVE_ON_WEEKEND | all requested dates are weekends |
| LVE_005 | LEAVE_NOT_FOUND | leave record not found |
| LVE_006 | LEAVE_REVOCATION_NOT_ALLOWED | revoke on non-approved leave |
| LVE_007 | LEAVE_CANCELLATION_NOT_ALLOWED | cancel on non-pending leave |
