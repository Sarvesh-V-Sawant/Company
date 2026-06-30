# Phase 15.17 — Employee Module Remediation Validation

**Date:** 2026-06-28  
**Phase:** 15.17  
**Status:** COMPLETE

## Defects Remediated

### DEF-EMP-001 — POST /api/v1/employees returns HTTP 400

**Root cause:** `EmployeeForm` submitted incorrect field names and missing required fields.

- `joiningDate` → `dateOfJoining` (schema mismatch)
- `salary` → `monthlySalary` (field rename)
- `role` field missing entirely
- PATCH method used for creates

**Fix:** Full rewrite of `EmployeeForm.tsx`:
- Split into `CreateEmployeeForm` (POST) and `EditEmployeeForm` (PUT)
- `createSchema` mirrors `CreateEmployeeSchema` with `z.coerce.number()` for salary
- `editSchema` mirrors `UpdateEmployeeSchema`
- Phone normalization: 10-digit Indian → `+91XXXXXXXXXX`, E.164 passthrough

**Verification:** POST /api/v1/employees returns HTTP 201 with valid payload.

### DEF-EMP-002 — React key warnings and broken navigation

**Root cause:** Frontend used `emp._id` (raw ObjectId object) but API serializes to `emp.id` (hex string).

**Fix:**
- `apps/admin/src/app/(portal)/employees/page.tsx` — `emp._id` → `emp.id` (key + router.push)
- `apps/admin/src/app/(portal)/employees/[id]/page.tsx` — `employee.joiningDate` → `employee.dateOfJoining`
- `apps/admin/src/types/api.ts` — `Employee` interface updated: `_id` → `id`, `joiningDate` → `dateOfJoining`, added `monthlySalary`, `dateOfLeaving`, `hasRegisteredDevice`

**Verification:** Employee list renders without React key warnings; clicking an employee navigates correctly.

## Quality Gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` | exit 0 ✓ |
| `eslint src --max-warnings 0` | exit 0 ✓ |
| `jest` | 279 passed, 0 failed ✓ |
| `next build` | exit 0 ✓ |
