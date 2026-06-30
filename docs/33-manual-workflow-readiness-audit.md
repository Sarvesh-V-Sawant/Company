# Phase 15.10 — Manual Workflow Readiness Audit

**Date:** 2026-06-27  
**Auditor:** Claude Code (Phase 15.10)  
**Scope:** Admin Portal — all 26 pages, 70 API routes  
**Quality Gates:** `npm run build` ✅ | `npm run lint` ✅ | 286/286 tests ✅

---

## Executive Summary

The Admin Portal has been audited end-to-end by tracing every UI action through its API route, service, and database layer. The build is clean and all tests pass. However, **8 defects** were found through static trace analysis — several of which make entire modules non-functional at runtime.

| Severity | Count | Description |
|----------|-------|-------------|
| **P0 — Feature broken** | 2 | Entire attendance view; employee activate/deactivate |
| **P1 — Workflow broken** | 3 | Reports wrong paths; export routing; audit-log detail |
| **P2 — Degraded UX** | 3 | Employee export; pagination mismatch; dashboard count |

**Overall readiness: NOT PRODUCTION-READY** — P0 and P1 issues must be resolved before launch.

---

## Audit Method

For each page:
1. Identified all `apiFetch` / `useSWR` calls and HTTP methods
2. Traced each call to the corresponding API route file
3. Verified the route exists, accepts the correct method, and returns the expected shape
4. Cross-checked service return keys against hook/page field access

---

## Module-by-Module Findings

### 1. Dashboard (`/dashboard`)

| UI Action | API Call | Route Exists | Issue |
|-----------|----------|-------------|-------|
| Employee count stat | `GET /api/v1/employees?limit=1` | ✅ | P2: reads `empData?.pagination?.total` — API returns `meta.total` → always **0** |
| Attendance overview | `GET /api/v1/attendance?date=...&limit=1` | ❌ | P0: no base attendance list route → **404** |
| Pending leaves count | `GET /api/v1/leaves?status=pending&limit=1` | ✅ | OK — route spreads `meta`, `useSidebarCounts` has fallback for both `meta`/`pagination` |
| Pending regs count | `GET /api/v1/regularizations?status=pending&limit=1` | ✅ | OK |
| Quick action links | href navigation | ✅ | OK |

**Status:** Partial. Employee count always 0. Attendance overview always empty.

---

### 2. Employees (`/employees`, `/employees/new`, `/employees/[id]`)

#### 2a. Employee List (`/employees`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| List load | `GET /api/v1/employees?...` | ✅ `employees/route.ts` | P2: route returns `meta`, hook expects `pagination` → pagination UI never renders |
| Search/filter | URL param → re-fetch | ✅ | OK (data loads; just no page controls) |
| Status filter | URL param → re-fetch | ✅ | OK |
| Export button | `apiFetchBlob('GET /api/v1/employees?limit=10000')` | ✅ | P2: endpoint returns JSON not Excel — downloaded `.xlsx` will be corrupt JSON |
| Add Employee | `router.push('/employees/new')` | ✅ | OK |
| Row click | `router.push('/employees/${id}')` | ✅ | OK |

#### 2b. Create Employee (`/employees/new`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Submit form | `POST /api/v1/employees` | ✅ `employees/route.ts` | OK — creates User + Employee atomically |
| Success | `toast.success` + navigate to `/employees` | ✅ | OK |

#### 2c. Employee Detail (`/employees/[id]`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Page load | `GET /api/v1/employees/${id}` | ✅ | OK |
| Edit (Sheet) | `PUT /api/v1/employees/${id}` via EmployeeForm | ✅ | OK |
| **Activate / Deactivate** | `PATCH /api/v1/employees/${id}` | ❌ | **P0: route has `GET`, `PUT`, `DELETE` only — no `PATCH` → 405**. Correct endpoints: `PATCH /employees/${id}/activate` and `PATCH /employees/${id}/deactivate` |
| Delete button | — | ✅ | No delete button — correct (soft-delete via deactivate) |

---

### 3. Attendance (`/attendance`, `/attendance/weekly`, `/attendance/monthly`, `/attendance/[id]`)

#### 3a. Daily View (`/attendance`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| List load | `GET /api/v1/attendance?...` | ❌ | **P0: no `attendance/route.ts` exists — 404**. All existing routes are sub-paths (`/checkin`, `/checkout`, `/history`, `/[employeeId]`, etc.) |
| Search/date/status filter | re-fetch same broken URL | ❌ | Same 404 |
| Row view | no per-record detail link | — | No clickthrough (table rows are not linked) |

#### 3b. Weekly Grid (`/attendance/weekly`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Grid load | `GET /api/v1/attendance?startDate=...&endDate=...&limit=500` | ❌ | **P0: same missing base route → 404** |
| Prev/Next week navigation | URL param → re-fetch | ❌ | Same 404 |

#### 3c. Monthly Summary (`/attendance/monthly`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Summary load | `GET /api/v1/attendance?startDate=...&endDate=...&limit=2000` | ❌ | **P0: same missing base route → 404** |
| Month navigation | URL param → re-fetch | ❌ | Same 404 |

#### 3d. Employee Attendance Detail (`/attendance/[id]`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Record load | `GET /api/v1/attendance/${employeeId}` | ✅ `attendance/[employeeId]/route.ts` | OK — returns history list; page handles array correctly |

**Status: CRITICAL.** All three admin attendance list/grid/summary views are broken (404). Only the per-employee history drilldown works.

---

### 4. Leave (`/leave`, `/leave/[id]`, `/leave/balances`)

#### 4a. Leave List (`/leave`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| List load | `GET /api/v1/leaves?...` | ✅ | P2: service returns `meta`, route spreads, hook expects `pagination` → pagination never renders |
| Status/date filters | re-fetch | ✅ | OK |
| Approve inline | `POST /api/v1/leaves/${id}/approve` via LeaveApprovalForm | ✅ | OK |
| Reject inline | `POST /api/v1/leaves/${id}/reject` via LeaveApprovalForm | ✅ | OK |
| Row click → detail | `router.push('/leave/${id}')` | ✅ | OK |
| Balances tab | `Link href="/leave/balances"` | ✅ | OK |

#### 4b. Leave Detail (`/leave/[id]`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Page load | `GET /api/v1/leaves/${id}` | ✅ | OK |
| Approve | LeaveApprovalForm → `POST /api/v1/leaves/${id}/approve` | ✅ | OK |
| Reject | LeaveApprovalForm → `POST /api/v1/leaves/${id}/reject` | ✅ | OK |
| Revoke | — | — | No revoke button on detail page (only available via API) |

#### 4c. Leave Balances (`/leave/balances`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Table load | `GET /api/v1/leaves/balance?...` | ✅ | OK — returns array, no pagination expected |
| Search | URL param → re-fetch | ✅ | OK |

**Status:** Functional. Minor: pagination missing for large leave datasets.

---

### 5. Regularization (`/regularization`, `/regularization/[id]`)

#### 5a. Regularization List

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| List load | `GET /api/v1/regularizations?...` | ✅ | ✅ OK — RegularizationService returns `pagination` (not `meta`); hook expects `pagination` → **works correctly** |
| Status filter | re-fetch | ✅ | OK |
| Approve inline | `POST /api/v1/regularizations/${id}/approve` via form | ✅ | OK |
| Reject inline | `POST /api/v1/regularizations/${id}/reject` via form | ✅ | OK |
| Row click → detail | `router.push('/regularization/${id}')` | ✅ | OK |

#### 5b. Regularization Detail

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Page load | `GET /api/v1/regularizations/${id}` | ✅ | OK |
| Approve/Reject | form → `POST` to approve/reject routes | ✅ | OK |

**Status:** Fully functional.

---

### 6. Payroll (`/payroll`, `/payroll/[yearMonth]/[id]`)

#### 6a. Payroll List

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| List load | `GET /api/v1/payroll?...` | ✅ | P2: service returns `meta`, route spreads, hook expects `pagination` → pagination never renders |
| Month/status filter | re-fetch | ✅ | OK |
| Run Payroll modal | `POST /api/v1/payroll/compute` via PayrollComputeModal | ✅ | OK |
| Finalise | `POST /api/v1/payroll/${id}/${yearMonth}/finalize` | ✅ | OK |
| Unfinalize | `POST /api/v1/payroll/${id}/${yearMonth}/unfinalize` | ✅ | OK |
| Fix Stale (Reopen) | PayrollReopenWizard → unfinalize then adjust | ✅ | OK |
| Row click → detail | `router.push('/payroll/${yearMonth}/${id}')` | ✅ | OK |

#### 6b. Payslip Detail (`/payroll/[yearMonth]/[id]`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Page load | `GET /api/v1/payroll/${id}/${yearMonth}` | ✅ | OK |
| Export PDF | `apiFetchBlob('/api/v1/payroll/${id}/${yearMonth}/export')` | ✅ (HTTP 501) | Intentional deferral — returns GEN_004 501 |
| Finalise | PayrollFinalizeModal → finalize route | ✅ | OK |
| Unfinalize | PayrollUnfinalizeModal → unfinalize route | ✅ | OK |

**Status:** Core payroll workflow functional. PDF export intentionally deferred (501). Pagination broken for large datasets.

---

### 7. Notifications (`/notifications`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| List load | `GET /api/v1/notifications?...` | ✅ | P2: service returns `meta`, route spreads, hook expects `pagination` → pagination never renders |
| Filter read/unread | re-fetch | ✅ | OK |
| Mark single read | `PATCH /api/v1/notifications/${id}/read` | ✅ | OK |
| Mark all read | `PATCH /api/v1/notifications/read-all` | ✅ | OK |

**Status:** Functional. Pagination broken at scale.

---

### 8. Reports (`/reports`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Attendance Report — Generate | `GET /api/v1/reports/attendance?startDate=...&endDate=...` | ✅ | OK |
| Attendance Report — Export | `apiFetchBlob('/api/v1/reports/attendance?...&export=xlsx')` | ❌ | **P1: wrong routing.** Appends `?export=xlsx` to JSON endpoint. Export route is at `/api/v1/reports/attendance/export`. JSON returned as blob → corrupt `.xlsx` download |
| Leave Report — Generate | `GET /api/v1/reports/leaves?...` | ❌ | **P1: wrong path.** UI calls `/reports/leaves`, route is at `/reports/leave` (singular) → **404** |
| Leave Report — Export | `apiFetchBlob('/api/v1/reports/leaves?...&export=xlsx')` | ❌ | P1: wrong path + wrong export routing → **404** |
| Payroll Report — Generate | `GET /api/v1/reports/payroll?yearMonth=...` | ✅ | OK |
| Payroll Report — Export | `apiFetchBlob('/api/v1/reports/payroll?...&export=xlsx')` | ❌ | **P1: wrong export routing.** Export route at `/reports/payroll/export`. JSON returned as blob → corrupt download |
| Employee Summary — Generate | `GET /api/v1/reports/employees` | ❌ | **P1: wrong path.** UI calls `/reports/employees`, route at `/reports/employee-summary` → **404** |
| Employee Summary — Export | `apiFetchBlob('/api/v1/reports/employees?export=xlsx')` | ❌ | P1: wrong path + wrong export routing → **404** |
| Department Summary — Generate | `GET /api/v1/reports/departments` | ❌ | **P1: wrong path.** UI calls `/reports/departments`, route at `/reports/department-summary` → **404** |
| Department Summary — Export | `apiFetchBlob('/api/v1/reports/departments?export=xlsx')` | ❌ | P1: wrong path + wrong export routing → **404** |

**Status: SEVERELY BROKEN.** Only Attendance Report generates correctly. All 5 exports are broken. Leave, Employee Summary, and Department Summary generate with 404.

---

### 9. Audit Logs (`/audit-logs`, `/audit-logs/[id]`)

#### 9a. Audit Log List

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| List load | `GET /api/v1/audit-logs?...` | ✅ | OK — implemented Phase 15.9 |
| Search/filter | re-fetch | ✅ | OK |
| Row click → detail | `router.push('/audit-logs/${id}')` | ✅ | Navigates OK |

#### 9b. Audit Log Detail (`/audit-logs/[id]`)

| UI Action | API Call | Route | Issue |
|-----------|----------|-------|-------|
| Page load | `GET /api/v1/audit-logs/${id}` | ❌ | **P1: no `audit-logs/[id]/route.ts` exists.** Only the list route (`audit-logs/route.ts`) was implemented. Detail page always returns 404. |

**Status:** List functional. Detail page broken (404).

---

### 10. Settings (`/settings/*`)

All settings pages delegate to form components. Tracing each:

| Page | API (read) | API (write) | Status |
|------|-----------|-------------|--------|
| `/settings/company` | `GET /api/v1/settings/company` | `PUT /api/v1/settings/company` | ✅ OK |
| `/settings/shift` | `GET /api/v1/settings/company` | `PUT /api/v1/settings/shift` | ✅ OK |
| `/settings/working-days` | `GET /api/v1/settings/company` | `PUT /api/v1/settings/working-days` | ✅ OK |
| `/settings/holidays` | `GET /api/v1/settings/company` | `POST/DELETE /api/v1/settings/holidays[/id]` | ✅ OK |
| `/settings/leave-types` | `GET /api/v1/settings/company` | `POST/DELETE /api/v1/settings/leave-types[/code]` | ✅ OK |
| `/settings/geofence` | `GET /api/v1/settings/company` | `PUT /api/v1/settings/geofence` | ✅ OK |
| `/settings` (index) | Navigation links only | — | ✅ OK |

**Status:** All settings pages fully functional.

---

## CRUD Verification Matrix

| Module | Create | Read (List) | Read (Detail) | Update | Delete | Status Change |
|--------|--------|-------------|---------------|--------|--------|--------------|
| Employees | ✅ | ✅ (no pagination) | ✅ | ✅ | N/A (soft) | ❌ broken (405) |
| Attendance | N/A | ❌ 404 | ✅ | N/A | N/A | N/A |
| Leave | N/A (mobile) | ✅ (no pagination) | ✅ | N/A | N/A | ✅ approve/reject |
| Regularization | N/A (mobile) | ✅ | ✅ | N/A | N/A | ✅ approve/reject |
| Payroll | ✅ (compute) | ✅ (no pagination) | ✅ | ✅ (adjust) | N/A | ✅ finalize/unfinalize |
| Notifications | N/A (system) | ✅ (no pagination) | ❌ (no route) | ✅ (mark read) | N/A | ✅ read-all |
| Audit Logs | N/A (system) | ✅ | ❌ 404 | N/A | N/A | N/A |
| Settings (all) | ✅ | ✅ | N/A | ✅ | ✅ (holidays/leave types) | N/A |
| Reports | N/A | ✅ att only | N/A | N/A | N/A | N/A |

---

## Defect Catalogue

### P0 — Feature Completely Non-Functional

#### DEF-001: No Attendance Admin List API Route
- **Symptom:** All three attendance admin views (daily, weekly, monthly) show empty state permanently
- **Root Cause:** No `apps/admin/src/app/api/v1/attendance/route.ts` exists. The UI pages at `/attendance`, `/attendance/weekly`, `/attendance/monthly` all call `GET /api/v1/attendance?...` — this has no handler → 404
- **Affected Pages:** `/attendance` (daily), `/attendance/weekly`, `/attendance/monthly`, plus dashboard attendance overview
- **Fix:** Create `apps/admin/src/app/api/v1/attendance/route.ts` implementing admin list with filters: `date`, `startDate`, `endDate`, `employeeId`, `status`, `search`, `page`, `limit`. Delegate to `AttendanceService`

#### DEF-002: Employee Activate/Deactivate Always Fails (405)
- **Symptom:** "Activate" and "Deactivate" buttons on `/employees/[id]` always fail with toast error
- **Root Cause:** `employees/[id]/page.tsx` line 37 calls `PATCH /api/v1/employees/${id}`. The route at `employees/[id]/route.ts` exports `GET`, `PUT`, `DELETE` — no `PATCH`. The actual endpoints are at `PATCH /employees/${id}/activate` and `PATCH /employees/${id}/deactivate`
- **Fix:** Change the page to call the correct sub-routes: when `isActive` is true, call `PATCH /api/v1/employees/${id}/deactivate`; when false, call `PATCH /api/v1/employees/${id}/activate`

---

### P1 — Specific Workflow Broken

#### DEF-003: Reports Page — Wrong API Paths for Three Report Cards
- **Symptom:** Leave, Employee Summary, and Department Summary report cards show "Failed to generate report" toast on Generate
- **Root Cause:** `reports/page.tsx` uses wrong `exportPath` values:
  - UI: `/api/v1/reports/leaves` → Actual route: `/api/v1/reports/leave`
  - UI: `/api/v1/reports/employees` → Actual route: `/api/v1/reports/employee-summary`
  - UI: `/api/v1/reports/departments` → Actual route: `/api/v1/reports/department-summary`
- **Fix:** Update `exportPath` values in the three affected `ReportSection` usages in `reports/page.tsx`

#### DEF-004: All Report Exports Download Corrupt Files
- **Symptom:** Export buttons download files containing JSON text, not Excel data. Files are unreadable in Excel
- **Root Cause:** `ReportSection.exportXlsx()` appends `?export=xlsx` to the JSON fetch path (`${fetchPath}?${query}&export=xlsx`). The JSON endpoints (`/reports/attendance`, `/reports/payroll`, etc.) do not respond to `?export=xlsx` — they return JSON regardless. Export routes are at separate sub-paths: `/reports/attendance/export`, `/reports/leave/export`, `/reports/payroll/export`. None of these sub-routes support an `?export=xlsx` query trigger
- **Fix:** Change `exportXlsx()` to call `${fetchPath}/export?${query}` instead of `${fetchPath}?${query}&export=xlsx`

#### DEF-005: Audit Log Detail Page Always 404
- **Symptom:** Clicking any row in `/audit-logs` navigates to `/audit-logs/[id]` which shows "Audit log not found."
- **Root Cause:** `audit-logs/[id]/page.tsx` calls `GET /api/v1/audit-logs/${id}`. Only `apps/admin/src/app/api/v1/audit-logs/route.ts` exists (list only). No `audit-logs/[id]/route.ts` exists
- **Fix:** Create `apps/admin/src/app/api/v1/audit-logs/[id]/route.ts` implementing `GET` that calls `AuditService.getById(id)` (method to be added to AuditService)

---

### P2 — Degraded UX / Partial Functionality

#### DEF-006: Employee Export Exports JSON Not Excel
- **Symptom:** Export button on `/employees` downloads a `.xlsx` file containing raw JSON
- **Root Cause:** `apiFetchBlob('/api/v1/employees?limit=10000')` calls the list API which returns `Content-Type: application/json`, not an Excel stream
- **Fix:** Either (a) create a dedicated employee export endpoint (`GET /api/v1/employees/export`) that streams Excel, or (b) use the existing `GET /api/v1/reports/employee-summary` export path

#### DEF-007: Pagination Broken on Four Modules
- **Symptom:** Pages with >20 records show no pagination controls; total count on pagination bar shows 0
- **Root Cause:** Inconsistency between service return shapes and hook field access:

| Module | Service returns | Route response | Hook expects | Impact |
|--------|----------------|---------------|-------------|--------|
| Employees | `{ data, meta }` | explicit `meta:` | `data?.pagination` | ❌ broken |
| Leaves | `{ data, meta }` | `{ ...result }` → `meta` | `data?.pagination` | ❌ broken |
| Notifications | `{ data, meta }` | `{ ...result }` → `meta` | `data?.pagination` | ❌ broken |
| Payroll | `{ data, meta }` | `{ ...result }` → `meta` | `data?.pagination` | ❌ broken |
| Regularizations | `{ data, pagination }` | `{ ...result }` → `pagination` | `data?.pagination` | ✅ OK |
| Audit Logs | `{ data, pagination }` | explicit `pagination:` | `data?.pagination` | ✅ OK |

- **Fix:** Either rename service `meta` to `pagination` across EmployeeService, LeaveService, NotificationService, PayrollService, AttendanceService; OR update the four hooks to read `data?.meta` with a fallback; OR add a normalisation layer in the routes

#### DEF-008: Dashboard Employee Count Always Shows 0
- **Symptom:** "Total Employees" stat card on dashboard always shows 0
- **Root Cause:** Dashboard line 63 reads `empData?.pagination?.total`. `GET /api/v1/employees?limit=1` returns `{ meta: { total: N } }` (not `pagination`). Since `meta` is not `pagination`, the access returns undefined → 0
- **Fix:** Change dashboard line 39 to cast the response as `{ meta: { total: number } }` and access `empData?.meta?.total`, OR fix DEF-007 globally

---

## UI Issues

| Issue | Location | Severity |
|-------|----------|----------|
| Attendance overview (dashboard) never shows data | Dashboard | P0 |
| All 3 attendance views show permanent empty state | `/attendance/*` | P0 |
| Activate/Deactivate buttons silently fail | `/employees/[id]` | P0 |
| 3 of 5 report cards fail on Generate | `/reports` | P1 |
| All 5 export downloads produce corrupt files | `/reports` | P1 |
| Audit log detail always shows "not found" | `/audit-logs/[id]` | P1 |
| Employee Export downloads JSON as .xlsx | `/employees` | P2 |
| Pagination missing on Employees list | `/employees` | P2 |
| Pagination missing on Leaves list | `/leave` | P2 |
| Pagination missing on Notifications list | `/notifications` | P2 |
| Pagination missing on Payroll list | `/payroll` | P2 |
| Employee count stat always 0 | Dashboard | P2 |

---

## API Issues

| Issue | Endpoint | HTTP Status Observed | Root Cause |
|-------|----------|----------------------|-----------|
| No attendance admin list | `GET /api/v1/attendance` | 404 | Route file missing |
| Activate/deactivate wrong path | `PATCH /api/v1/employees/${id}` | 405 | Route has no PATCH handler |
| Leave report wrong path | `GET /api/v1/reports/leaves` | 404 | Path should be `/reports/leave` |
| Employee summary wrong path | `GET /api/v1/reports/employees` | 404 | Path should be `/reports/employee-summary` |
| Department summary wrong path | `GET /api/v1/reports/departments` | 404 | Path should be `/reports/department-summary` |
| Report exports wrong path | `GET /api/v1/reports/*/...?export=xlsx` | 404 | Export routes are at `*/export` sub-paths |
| Audit log detail missing | `GET /api/v1/audit-logs/${id}` | 404 | Route file missing |

---

## Database Issues

No schema or persistence defects found. All Mongoose models align with their service layers. Indexes are in place. The only DB-layer risk is:

- **Attendance records not created by admin system:** Attendance is mobile-app driven (check-in/checkout). If the mobile app is not seeded with test data, all attendance admin views will show empty even after the route is fixed.

---

## UX Issues

| Issue | Impact |
|-------|--------|
| `window.location.reload()` used for post-edit refresh (employees, leave, regularization detail) | Loses scroll position, slower than SWR mutate |
| Report "Generate" button must be clicked every time — no auto-load | Minor friction; intentional design |
| Attendance detail page (`/attendance/[id]`) has no back-link to filtered daily list | Dead end navigation |
| Weekly attendance grid "Next" button disabled when `weekOffset >= 0` — prevents navigation to current week from past weeks | Logic correct but confusing when `weekOffset` exactly equals 0 |
| Leave balance page has no way to adjust balances from admin UI | Admin-only adjustment not supported |
| Payslip export button shows but returns 501 with no user-visible explanation | Deferred feature has no tooltip/disable state |

---

## Deferred Features Visible in UI

| Feature | UI Location | API Response | User Impact |
|---------|-------------|-------------|------------|
| Payslip PDF export | `/payroll/[yearMonth]/[id]` Export PDF button | `GEN_004` 501 | Toast "Export failed" — confusing without explanation |
| Attendance correction | No UI surface (button not exposed) | `GEN_004` 501 | Not visible — OK |
| Payroll month lock | No UI surface | `GEN_004` 501 | Not visible — OK |
| Individual notification detail | `/audit-logs/[id]` (different from `/notifications/[id]`) | `GEN_004` 501 | No UI surface in admin for notification detail — OK |

**Recommendation:** Disable the Export PDF button on payslip detail with a tooltip "Payslip PDF export coming soon" to avoid confusing 501 response.

---

## Production Risks

| Risk | Severity | Module |
|------|----------|--------|
| Attendance data completely invisible to admins | Critical | Attendance |
| Employee status management (activate/deactivate) silently broken | Critical | Employees |
| Three report types return no data | High | Reports |
| All report exports deliver corrupt files | High | Reports |
| Audit trail not drillable | Medium | Audit Logs |
| Pagination failure means admins see max 20 records per table | Medium | Employees, Leaves, Notifications, Payroll |
| Dashboard KPIs show stale/wrong counts | Medium | Dashboard |

---

## Recommended Fix Order

Priority order based on feature impact, fix complexity, and inter-dependencies:

### Batch 1 — P0 Fixes (must do before any production use)

1. **DEF-002 (5 min):** Fix employee activate/deactivate URL in `employees/[id]/page.tsx`:
   - Change `PATCH /employees/${id}` → `PATCH /employees/${id}/activate` or `/deactivate` based on current status

2. **DEF-007 (30 min):** Fix `meta` → `pagination` mismatch across 4 services or 4 hooks:
   - Rename `meta` → `pagination` in `EmployeeService.list()`, `LeaveService.list()`, `NotificationService.list()`, `PayrollService.listAdmin()`
   - Also fixes DEF-008 (dashboard count) as a side effect

3. **DEF-001 (2–3 hrs):** Create `apps/admin/src/app/api/v1/attendance/route.ts`:
   - Admin list endpoint: `GET` with query params `date`, `startDate`, `endDate`, `employeeId`, `status`, `search`, `page`, `limit`
   - Delegate to new `AttendanceService.adminList()` method
   - Returns `{ success: true, data: [...], pagination: {...} }` (use `pagination` not `meta` to match hooks)

### Batch 2 — P1 Fixes

4. **DEF-003 (5 min):** Fix three wrong `exportPath` values in `reports/page.tsx`:
   - `/reports/leaves` → `/reports/leave`
   - `/reports/employees` → `/reports/employee-summary`
   - `/reports/departments` → `/reports/department-summary`

5. **DEF-004 (15 min):** Fix report export routing in `reports/page.tsx`:
   - Change `apiFetchBlob(\`${fetchPath}?${query}&export=xlsx\`)` → `apiFetchBlob(\`${fetchPath}/export?${query}\`)`

6. **DEF-005 (1 hr):** Create `apps/admin/src/app/api/v1/audit-logs/[id]/route.ts`:
   - Add `AuditService.getById(id)` method
   - Create GET route with admin-only auth

### Batch 3 — P2 Fixes

7. **DEF-006 (2–3 hrs):** Employee export — add dedicated export endpoint or reuse reports:
   - Option A: Create `GET /api/v1/employees/export` → returns Excel stream via ExcelJS
   - Option B: Redirect to `GET /api/v1/reports/employee-summary/export`

8. **UX — Payslip export button (10 min):** Add `disabled` state and tooltip to the Export PDF button when feature is deferred

---

## Screens Requiring Improvement

| Screen | Issue | Effort |
|--------|-------|--------|
| `/attendance` (daily) | Entire view broken — needs new API route | High |
| `/attendance/weekly` | Broken — same root cause | High |
| `/attendance/monthly` | Broken — same root cause | High |
| `/employees/[id]` | Activate/deactivate wrong URL | Low |
| `/reports` | Wrong paths + wrong export routing | Low |
| `/audit-logs/[id]` | Missing API route for detail | Medium |
| `/employees` | Export downloads JSON | Medium |
| `/dashboard` | Employee count always 0; attendance overview empty | Low + High |
| `/payroll/[yearMonth]/[id]` | Deferred export not communicated to user | Low |

---

## Quality Gate Results

| Gate | Result | Notes |
|------|--------|-------|
| `npm run build` | ✅ Pass | No TypeScript errors, no compilation failures |
| `npm run lint` | ✅ Pass | No ESLint warnings or errors |
| `npm run test` | ✅ 286/286 | All test suites pass (worker force-exit warning is non-critical open handle leak in test teardown) |

**Note:** All defects listed above are runtime integration failures — the build passes cleanly because TypeScript's type checking does not verify that API route paths exist at compile time. The `apiFetch` calls are string literals with no compile-time route resolution. This is expected behavior; the defects can only be caught by runtime testing or static trace analysis (as performed in this audit).

---

## Decision

Phase 15.10 audit is complete. **8 defects identified across 26 pages.**

The platform is **not production-ready** as-is. The 2 P0 defects (attendance views broken, activate/deactivate broken) and 3 P1 defects (reports wrong paths, exports corrupt, audit detail 404) must be resolved before go-live.

**Recommended next step:** Fix all defects in Batches 1 and 2 (estimated 4–5 hours total). Batch 3 can follow. Then proceed to Phase 16 Workforce Tracking implementation.

Do not begin Phase 16 until the defect fixes are approved and applied.
