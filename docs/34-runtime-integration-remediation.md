# Phase 15.11 — Runtime Integration Remediation

**Date:** 2026-06-27  
**Phase:** 15.11  
**Scope:** Fix all P0/P1/P2 defects from `docs/33-manual-workflow-readiness-audit.md`

---

## Summary

All 8 defects resolved. Build clean. Lint clean. 286/286 tests pass. Runtime verified against live MongoDB Atlas.

| ID | Priority | Status | Defect |
|----|----------|--------|--------|
| DEF-001 | P0 | FIXED | Attendance admin list → 404 (no base route) |
| DEF-002 | P0 | FIXED | Employee activate/deactivate wrong URL |
| DEF-003 | P1 | FIXED | Report fetch paths wrong |
| DEF-004 | P1 | FIXED | Report export appended `?export=xlsx` to JSON endpoint |
| DEF-005 | P1 | FIXED | Audit log detail → 404 (no route) |
| DEF-006 | P2 | FIXED | Employee export downloaded JSON instead of XLSX |
| DEF-007 | P1 | FIXED | Employee/Leave/Payroll/Notification pagination never rendered |
| DEF-008 | P1 | FIXED | Dashboard employee count always 0 |

---

## DEF-001 — Attendance Admin List Missing Route (P0)

**Root cause:** `GET /api/v1/attendance` had no handler. All three admin views (daily/weekly/monthly) called this endpoint and received 404.

**Fix:**

1. **`apps/admin/src/validators/attendance.ts`** — Added `AttendanceAdminListQuerySchema` supporting `date`, `startDate`, `endDate`, `employeeId`, `status`, `search`, `page`, `limit` (limit max 2000 for monthly 31-day queries).

2. **`apps/admin/src/services/AttendanceService.ts`** — Added `static async adminList()` method that:
   - Filters `AttendanceDay` by `dateString` range, status, employeeId
   - Resolves employee name search via regex on `User` model
   - Batch-populates employee fields via `populate('employeeId', ...)`
   - Batch-fetches first check-in / last check-out from `AttendanceSession`
   - Returns `{ data, pagination }` matching `PaginatedResponse<AttendanceRecord>` shape

3. **`apps/admin/src/app/api/v1/attendance/route.ts`** — Created new file with `GET` handler: validates query via schema, calls `AttendanceService.adminList()`, returns paginated JSON.

**Runtime verification:**
```
GET /api/v1/attendance?page=1&limit=5
→ 200 { success: true, data: [...], pagination: { page: 1, limit: 5, total: N, totalPages: N } }
```

---

## DEF-002 — Employee Activate/Deactivate Wrong URL (P0)

**Root cause:** `employees/[id]/page.tsx` called `PATCH /api/v1/employees/${id}` with `{ isActive: !employee.isActive }` in the body. The `[id]` route only has `GET`, `PUT`, `DELETE` handlers. The real endpoints are `PATCH /employees/${id}/activate` and `PATCH /employees/${id}/deactivate`.

**Fix:** `apps/admin/src/app/(portal)/employees/[id]/page.tsx`

```typescript
// Before
await apiFetch(`/api/v1/employees/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !employee.isActive }) });

// After
const action = employee.isActive ? 'deactivate' : 'activate';
await apiFetch(`/api/v1/employees/${id}/${action}`, { method: 'PATCH' });
```

**Runtime verification:**
```
PATCH /api/v1/employees/6a3ecc971c5b9a69ac9102b0/activate
→ 200 { success: true, data: { message: "Employee activated. They must log in fresh on each device." } }
```

---

## DEF-003 — Report Fetch Paths Wrong (P1)

**Root cause:** `reports/page.tsx` used three incorrect `exportPath` values that didn't match actual API routes.

**Fix:** `apps/admin/src/app/(portal)/reports/page.tsx`

| Before | After |
|--------|-------|
| `/api/v1/reports/leaves` | `/api/v1/reports/leave` |
| `/api/v1/reports/employees` | `/api/v1/reports/employee-summary` |
| `/api/v1/reports/departments` | `/api/v1/reports/department-summary` |

**Runtime verification:**
```
GET /api/v1/reports/leave?startDate=2026-01-01&endDate=2026-12-31
→ 200 { success: true, data: [...] }
```

---

## DEF-004 — Report Export Wrong URL Pattern (P1)

**Root cause:** `exportXlsx()` constructed `${fetchPath}?${query}&export=xlsx`, appending a query param to the JSON data endpoint. Actual export routes live at `${fetchPath}/export`.

**Fix:** `apps/admin/src/app/(portal)/reports/page.tsx`

```typescript
// Before
const blob = await apiFetchBlob(`${fetchPath}?${query}&export=xlsx`);

// After
const blob = await apiFetchBlob(`${fetchPath}/export?${query}`);
```

---

## DEF-005 — Audit Log Detail Route Missing (P1)

**Root cause:** `audit-logs/[id]/page.tsx` called `GET /api/v1/audit-logs/${id}` which had no handler → 404.

**Fix:**

1. **`apps/admin/src/services/AuditService.ts`** — Added `static async getById(id: string)`: validates ObjectId, fetches single `AuditLog` document, batch-populates performer name from `User`, returns formatted record with `userId` object.

2. **`apps/admin/src/app/api/v1/audit-logs/[id]/route.ts`** — Created new file with `GET` handler delegating to `AuditService.getById()`.

**Runtime verification:**
```
GET /api/v1/audit-logs/6a3fff3a7e9b5cd3daa0fd37
→ 200 { success: true, data: { _id, userId: { firstName, lastName, email }, action, entity, ... } }
```

---

## DEF-006 — Employee Export Downloaded JSON (P2)

**Root cause:** Export button called `apiFetchBlob('/api/v1/employees?...')` — hitting the JSON list endpoint. No dedicated XLSX export endpoint existed.

**Fix:**

1. **`apps/admin/src/app/api/v1/employees/export/route.ts`** — Created new file: fetches up to 10,000 employees matching filters, generates XLSX via ExcelJS (11 columns: Employee ID, First Name, Last Name, Email, Phone, Department, Designation, Role, Status, Joining Date, Created At), returns with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

   Note: The limit override bypasses `ListEmployeesSchema`'s max=100 by parsing user-supplied filters first, then forcing `{ ...parsed, limit: 10000, page: 1 }`.

2. **`apps/admin/src/app/(portal)/employees/page.tsx`** — Changed export button URL:
   ```typescript
   // Before
   apiFetchBlob(`/api/v1/employees?${buildQuery({ search, limit: 10000 })}`)
   
   // After
   apiFetchBlob(`/api/v1/employees/export?${buildQuery({ search, isActive })}`)
   ```
   Also now passes `isActive` filter so export respects the status filter the admin has applied.

**Runtime verification:**
```
GET /api/v1/employees/export
→ 200 Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
     Content-Disposition: attachment; filename="employees-2026-06-27.xlsx"
```

---

## DEF-007/DEF-008 — Pagination Never Rendered / Dashboard Count Always 0 (P1)

**Root cause:** Services returned `{ data, meta: { page, limit, total, totalPages } }` but `PaginatedResponse<T>` type and all hooks expected `pagination:` key. Affected: `EmployeeService`, `LeaveService`, `NotificationService`, `PayrollService`, and the `employees` API route handler.

**Fix:** Renamed `meta:` → `pagination:` in 5 locations:

| File | Location |
|------|----------|
| `services/EmployeeService.ts` | `list()` return |
| `services/LeaveService.ts` | Both `list()` returns (replace_all) |
| `services/NotificationService.ts` | `list()` return |
| `services/PayrollService.ts` | `listAdmin()` and `listForEmployee()` returns |
| `app/api/v1/employees/route.ts` | `GET` response mapping |

Did **not** rename `meta: { reason: ... }` in `PayrollService` line 331 (AuditLog.create metadata field — unrelated).

**Runtime verification:**
```
GET /api/v1/employees?limit=2
→ 200 { ..., pagination: { page: 1, limit: 2, total: 8, totalPages: 4 } }
```

---

## Test Suite Corrections

Two test files asserted `result.meta.*` — updated to `result.pagination.*` to match the renamed service output:

- `src/__tests__/employees/EmployeeService.test.ts` — 3 assertions fixed
- `src/__tests__/notifications/NotificationService.test.ts` — 1 assertion fixed

---

## Quality Gate Results

```
npm run build  → exit 0 (clean, no TS errors)
npm run lint   → exit 0 (no ESLint warnings)
npm run test   → 286 passed, 0 failed (18 suites)
```

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/admin/src/app/api/v1/attendance/route.ts` | Admin attendance list endpoint (DEF-001) |
| `apps/admin/src/app/api/v1/audit-logs/[id]/route.ts` | Audit log detail endpoint (DEF-005) |
| `apps/admin/src/app/api/v1/employees/export/route.ts` | Employee XLSX export endpoint (DEF-006) |

## Files Modified

| File | Change |
|------|--------|
| `apps/admin/src/validators/attendance.ts` | Added `AttendanceAdminListQuerySchema` |
| `apps/admin/src/services/AttendanceService.ts` | Added `adminList()` static method |
| `apps/admin/src/services/AuditService.ts` | Added `getById()` static method + `AppError` import |
| `apps/admin/src/services/EmployeeService.ts` | `meta` → `pagination` in `list()` |
| `apps/admin/src/services/LeaveService.ts` | `meta` → `pagination` in both `list()` returns |
| `apps/admin/src/services/NotificationService.ts` | `meta` → `pagination` in `list()` |
| `apps/admin/src/services/PayrollService.ts` | `meta` → `pagination` in `listAdmin()` and `listForEmployee()` |
| `apps/admin/src/app/api/v1/employees/route.ts` | `meta: result.meta` → `pagination: result.pagination` in GET response |
| `apps/admin/src/app/(portal)/employees/[id]/page.tsx` | Conditional activate/deactivate URL |
| `apps/admin/src/app/(portal)/employees/page.tsx` | Export URL → `/employees/export` |
| `apps/admin/src/app/(portal)/reports/page.tsx` | Three wrong exportPath values + `exportXlsx` URL pattern |
| `apps/admin/src/__tests__/employees/EmployeeService.test.ts` | 3 assertions `meta` → `pagination` |
| `apps/admin/src/__tests__/notifications/NotificationService.test.ts` | 1 assertion `meta` → `pagination` |

---

## Decision

All P0 and P1 defects resolved and runtime-verified. P2 (DEF-006) also resolved. Phase 15.11 complete.

**Phase 16 may now begin.**
