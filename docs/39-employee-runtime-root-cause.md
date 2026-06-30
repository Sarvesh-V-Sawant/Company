# Phase 15.16 — Employee Creation Runtime Root Cause Analysis

**Date:** 2026-06-28  
**Defect:** `POST /api/v1/employees` → HTTP 400 Validation failed  
**Secondary:** React `key` warning on Employee list page  

---

## 1. Runtime Evidence

```
POST /api/v1/employees
→ HTTP 400
{
  "success": false,
  "error": {
    "code": "GEN_001",
    "message": "Validation failed."
  }
}
```

---

## 2. API Payload (from Chrome DevTools)

```json
{
  "firstName":   "Sarvesh",
  "lastName":    "Sawant",
  "email":       "saru.sawant03@gmail.com",
  "phone":       "8879320906",
  "department":  "Developer",
  "designation": "Software Developer",
  "role":        "employee",
  "isActive":    true
}
```

---

## 3. Validation Failure — Exact Analysis

### Backend validator: `CreateEmployeeSchema`
File: `apps/admin/src/validators/employee.ts:21`

```typescript
export const CreateEmployeeSchema = z.object({
  employeeId:    z.string().min(1).max(20),                             // REQUIRED
  firstName:     z.string().min(1).max(50),                             // REQUIRED
  lastName:      z.string().min(1).max(50),                             // REQUIRED
  email:         z.string().email().max(255),                           // REQUIRED
  role:          z.enum(['admin', 'employee']).default('employee'),      // has default
  phone:         z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),      // optional, E.164 format
  department:    z.string().max(100).optional(),
  designation:   z.string().max(100).optional(),
  monthlySalary: z.number().min(0),                                     // REQUIRED
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)               // REQUIRED
                   .refine(d => new Date(d) <= new Date()),
});
```

### Zod errors produced for the captured payload

| # | Field | Rule | Received | Expected | Error |
|---|---|---|---|---|---|
| 1 | `employeeId` | `z.string().min(1)` | `undefined` | string, min 1 char | `Required` |
| 2 | `monthlySalary` | `z.number().min(0)` | `undefined` | number ≥ 0 | `Required` |
| 3 | `dateOfJoining` | `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` | `undefined` | `"YYYY-MM-DD"` | `Required` |
| 4 | `phone` | `z.string().regex(/^\+[1-9]\d{1,14}$/)` | `"8879320906"` | E.164 e.g. `"+918879320906"` | `Must be E.164 format (+countrycode...)` |

**All 4 errors fire simultaneously. Zod collects all errors before returning. Any one of them alone causes HTTP 400.**

Note: `isActive: true` in the payload is stripped by Zod (unknown key) — not an error, not a cause.

---

## 4. Missing UI Fields

The frontend form (`apps/admin/src/components/forms/EmployeeForm.tsx`) has no inputs for:

| Backend Required Field | UI Input | Impact |
|---|---|---|
| `employeeId` | **ABSENT** — no `<Input>` or `register('employeeId')` | Always missing from payload → always fails |
| `monthlySalary` | **ABSENT** — no `<Input>` or `register('monthlySalary')` | Always missing → always fails |
| `dateOfJoining` | **ABSENT** — no date picker or `register('dateOfJoining')` | Always missing → always fails |

The form cannot succeed even with correct phone format because 3 required fields have no UI entry point at all.

---

## 5. Schema Comparison — Frontend vs Backend

| Backend Field | Required | Backend Type / Rule | Frontend Schema | Frontend Sends | Match |
|---|---|---|---|---|---|
| `employeeId` | YES | `string`, min 1, max 20 | **not defined** | not sent | ❌ MISSING |
| `firstName` | YES | `string`, min 1, max 50 | `z.string().min(1)` | `"Sarvesh"` | ✓ |
| `lastName` | YES | `string`, min 1, max 50 | `z.string().min(1)` | `"Sawant"` | ✓ |
| `email` | YES | `z.string().email()` | `z.string().email()` | `"saru.sawant03@gmail.com"` | ✓ |
| `role` | YES (default) | `enum ['admin','employee']` | `z.enum(['admin','employee'])` | `"employee"` | ✓ |
| `phone` | optional | E.164 regex `^\+[1-9]\d{1,14}$` | `z.string().optional()` | `"8879320906"` | ❌ FORMAT MISMATCH |
| `department` | optional | `string`, max 100 | `z.string().optional()` | `"Developer"` | ✓ |
| `designation` | optional | `string`, max 100 | `z.string().optional()` | `"Software Developer"` | ✓ |
| `monthlySalary` | YES | `number`, min 0 | **not defined** | not sent | ❌ MISSING |
| `dateOfJoining` | YES | `YYYY-MM-DD`, not future | **not defined** | not sent | ❌ MISSING |
| — | — | — | `isActive: z.boolean()` | `true` | ❌ EXTRA (stripped by Zod, harmless) |

**Frontend Zod schema** (`EmployeeForm.tsx:13`) is independently defined and does not match `CreateEmployeeSchema`. It was likely written for an earlier MVP and never updated to match the final backend contract.

---

## 6. Root Cause

**Primary:** The `EmployeeForm` component is missing three required form fields (`employeeId`, `monthlySalary`, `dateOfJoining`). The backend `CreateEmployeeSchema` unconditionally requires all three. The form cannot produce a valid payload regardless of what values the user enters for the fields that ARE present.

**Secondary:** The `phone` field has a format contract mismatch. The frontend accepts any string; the backend requires E.164 (`+<countrycode><number>`). The form provides no format hint, no `+` prefix input, and no client-side E.164 validation. Any non-empty phone value fails unless the user manually types `+918879320906`.

**Root cause location:**
```
apps/admin/src/components/forms/EmployeeForm.tsx
  — local Zod schema (line 13) diverges from CreateEmployeeSchema
  — missing inputs: employeeId, monthlySalary, dateOfJoining
  — missing E.164 phone validation
```

---

## 7. React Key Warning Analysis

### Symptom
React console: `Warning: Each child in a list should have a unique "key" prop.`

### Source
`apps/admin/src/app/(portal)/employees/page.tsx:94`

```tsx
<tr key={emp._id} ...>
```

### API actual response shape
From runtime audit (pass 3 shape discovery):
```
empArr[0] keys: id,employeeId,firstName,lastName,email,role,department,designation,
                dateOfJoining,isActive,hasRegisteredDevice,monthlySalary
```

The API returns `id`, not `_id`.

### TypeScript type definition
`apps/admin/src/types/api.ts:4`
```typescript
export interface Employee {
  _id: string;   // ← declared as _id
  ...
}
```

### Confirmed in EmployeeService
`apps/admin/src/services/EmployeeService.ts:85`
```typescript
const base: Record<string, unknown> = {
  id: u._id.toHexString(),  // ← serialized as id
  ...
};
```

### Effect
`emp._id` is always `undefined` at runtime — the `_id` key does not exist on the returned object.
- `key={undefined}` → React uses `"undefined"` string for every row → duplicate keys → warning fires for every employee row
- `router.push(`/employees/${emp._id}`)` → navigates to `/employees/undefined` → 404 page
- `apiFetch(`/api/v1/employees/${employee._id}`, { method: 'PATCH', ... })` in `EmployeeForm.tsx:47` → PATCH to `/api/v1/employees/undefined` → 404

**The React key warning is a symptom of the same `_id`→`id` type mismatch that also breaks row click navigation and employee update.**

---

## 8. Exact Files Requiring Changes

| File | Line(s) | Issue |
|---|---|---|
| `src/types/api.ts` | 4 | `Employee._id: string` → change to `id: string` |
| `src/components/forms/EmployeeForm.tsx` | 13–22 | Local schema missing `employeeId`, `monthlySalary`, `dateOfJoining`; no E.164 phone validation |
| `src/components/forms/EmployeeForm.tsx` | 27–41 | Missing `<Input>` fields for `employeeId`, `monthlySalary`, `dateOfJoining` |
| `src/components/forms/EmployeeForm.tsx` | 47 | Uses `employee._id` → must use `employee.id` |
| `src/app/(portal)/employees/page.tsx` | 94, 102 | Uses `emp._id` in `key=` and `router.push()` → must use `emp.id` |

---

## 9. Minimal Safe Fix

### Fix 1 — `types/api.ts`
Change `_id: string` → `id: string` in the `Employee` interface.
*(Same fix already applied to `PayrollRecord` in DEF-NEW-001.)*

### Fix 2 — `EmployeeForm.tsx` schema
Replace the local Zod schema with one that matches `CreateEmployeeSchema`:
- Add `employeeId: z.string().min(1).max(20)`
- Add `monthlySalary: z.coerce.number().min(0)`
- Add `dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
- Add E.164 validation to `phone`
- Remove `isActive` (not accepted by backend)

### Fix 3 — `EmployeeForm.tsx` inputs
Add `<Input>` for `employeeId`, `<Input type="number">` for `monthlySalary`, `<Input type="date">` for `dateOfJoining`. Add phone format hint.

### Fix 4 — `EmployeeForm.tsx` PATCH URL
Line 47: `employee._id` → `employee.id`

### Fix 5 — `employees/page.tsx`
Lines 94, 102: `emp._id` → `emp.id`

---

## 10. Regression Risk

| Change | Risk | Notes |
|---|---|---|
| `types/api.ts` `Employee._id` → `id` | Medium | Any other component that reads `employee._id` would also break if not updated. Must grep all usages. |
| Form schema / new fields | Low | Additive change; existing optional fields unaffected |
| `employees/page.tsx` key fix | Low | Pure key prop fix; no logic change |
| `employees/page.tsx` navigation fix | Low | Fixes broken navigation; no side effects |
| `EmployeeForm.tsx` PATCH URL fix | Low | Fixes broken PATCH; previously always 404 |

**Regression check required:** Before fixing `Employee._id → id`, grep entire codebase for `employee._id`, `emp._id`, `.employee?._id` to find all downstream consumers.

---

## Summary

Two independent defects confirmed:

**DEF-EMP-001 (P0 — Blocker):** `POST /api/v1/employees` always returns HTTP 400. Root cause: `EmployeeForm.tsx` omits 3 required backend fields (`employeeId`, `monthlySalary`, `dateOfJoining`) and sends `phone` in wrong format. No employee can ever be created through the UI.

**DEF-EMP-002 (P1 — High):** React key warning + broken navigation on Employee list. Root cause: `types/api.ts` declares `Employee._id` but API returns `id`. Every list row has `key={undefined}`, every row click navigates to `/employees/undefined`, every PATCH sends to wrong URL.
