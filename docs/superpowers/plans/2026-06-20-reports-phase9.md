# Phase 9 — Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 9 report endpoints (attendance, leave, payroll, employee-summary, department-summary, dashboard-summary) with Excel exports, filters, audit logging, and unit tests.

**Architecture:** Single `ReportService` class with one method per report/export. Thin route handlers handle auth (`assertRole admin`) + validation → delegate to service → return JSON or binary Excel. ExcelJS generates all `.xlsx` exports as in-memory Buffers.

**Tech Stack:** Next.js 16.2.9, Mongoose 8, ExcelJS (new install), Zod, Jest

## Global Constraints

- Admin-only: all 9 endpoints require `assertRole(payload, 'admin')` → 403 if employee
- Excel exports only — no CSV
- Export max range: attendance 366 days; leave/payroll unrestricted
- List endpoints max range: attendance 90 days
- Export responses: raw binary, NO `{ success, data }` envelope
- List responses: `NextResponse.json({ success: true, data, meta })`
- Audit log every view (`REPORT_VIEWED`) and export (`REPORT_EXPORTED`)
- `AppError` from `@services/AuthService` for domain errors
- `assertRole` from `@mw/requireRole` (throws `AuthError` with `AUTH_006` / 403)
- All models live in `src/models/` — no new models needed for reports
- `AttendanceDay.employeeId` → `User._id`; `Leave.employeeId` → `User._id`; `PayrollRecord.employeeId` → `Employee._id` (has `employeeSnapshot` already — use snapshot, no join needed)
- `User.employeeId` is the **string employee code** (e.g. "EMP001"), `User._id` is the ObjectId used in AttendanceDay/Leave

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/admin/package.json` | Modify | Add `exceljs` dependency |
| `src/validators/report.ts` | Create | Zod schemas for all 9 endpoints |
| `src/services/ReportService.ts` | Rewrite | All 9 report/export methods |
| `src/app/api/v1/reports/attendance/route.ts` | Create | GET attendance list |
| `src/app/api/v1/reports/attendance/export/route.ts` | Create | GET attendance Excel |
| `src/app/api/v1/reports/leave/route.ts` | Create | GET leave list |
| `src/app/api/v1/reports/leave/export/route.ts` | Create | GET leave Excel |
| `src/app/api/v1/reports/payroll/route.ts` | Create | GET payroll list |
| `src/app/api/v1/reports/payroll/export/route.ts` | Create | GET payroll Excel |
| `src/app/api/v1/reports/employee-summary/route.ts` | Create | GET employee summary |
| `src/app/api/v1/reports/department-summary/route.ts` | Create | GET department summary |
| `src/app/api/v1/reports/dashboard-summary/route.ts` | Create | GET dashboard metrics |
| `src/__tests__/reports/ReportService.test.ts` | Create | Unit tests (10 cases) |

---

## Task 1: Install ExcelJS

**Files:**
- Modify: `apps/admin/package.json`

**Interfaces:**
- Produces: `import ExcelJS from 'exceljs'` available in TypeScript

- [ ] **Step 1: Install exceljs**

```bash
cd apps/admin && npm install exceljs
```

Expected: `package.json` dependencies now includes `"exceljs": "^4.x.x"` (latest stable).

- [ ] **Step 2: Verify TypeScript types resolve**

ExcelJS ships its own types. Confirm by running:
```bash
cd apps/admin && npx tsc --noEmit --strict false 2>&1 | grep exceljs || echo "Types OK"
```

Expected: no exceljs errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/package.json apps/admin/package-lock.json
git commit -m "chore(deps): add exceljs for Excel report generation"
```

---

## Task 2: Validators

**Files:**
- Create: `apps/admin/src/validators/report.ts`

**Interfaces:**
- Produces:
  - `AttendanceReportQuery` type
  - `AttendanceExportQuery` type
  - `LeaveReportQuery` type
  - `LeaveExportQuery` type
  - `PayrollReportQuery` type
  - `PayrollExportQuery` type
  - `EmployeeSummaryQuery` type
  - `DepartmentSummaryQuery` type

- [ ] **Step 1: Write `src/validators/report.ts`**

```typescript
import { z } from 'zod';

const dateStr  = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Must be a valid ObjectId');

export const AttendanceReportQuerySchema = z.object({
  startDate:  dateStr,
  endDate:    dateStr,
  employeeId: objectId.optional(),
  department: z.string().optional(),
  status:     z.enum(['present','absent','half-day','leave','holiday','weekend','lwp','not-applicable']).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
});

export const AttendanceExportQuerySchema = AttendanceReportQuerySchema.omit({ page: true, limit: true });

export const LeaveReportQuerySchema = z.object({
  employeeId: objectId.optional(),
  department: z.string().optional(),
  leaveType:  z.enum(['paidLeave','sickLeave','casualLeave','lwp']).optional(),
  status:     z.enum(['pending','approved','rejected','cancelled','revoked','withdrawn']).optional(),
  leaveYear:  z.coerce.number().int().min(2020).max(2099).optional(),
  startDate:  dateStr.optional(),
  endDate:    dateStr.optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
});

export const LeaveExportQuerySchema = LeaveReportQuerySchema.omit({ page: true, limit: true });

export const PayrollReportQuerySchema = z.object({
  yearMonth:  z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM').optional(),
  status:     z.enum(['draft','finalised']).optional(),
  department: z.string().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
});

export const PayrollExportQuerySchema = PayrollReportQuerySchema.omit({ page: true, limit: true });

export const EmployeeSummaryQuerySchema = z.object({
  month:      z.coerce.number().int().min(1).max(12).optional(),
  year:       z.coerce.number().int().min(2020).max(2099).optional(),
  department: z.string().optional(),
  employeeId: objectId.optional(),
});

export const DepartmentSummaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year:  z.coerce.number().int().min(2020).max(2099).optional(),
});

export type AttendanceReportQuery  = z.infer<typeof AttendanceReportQuerySchema>;
export type AttendanceExportQuery  = z.infer<typeof AttendanceExportQuerySchema>;
export type LeaveReportQuery       = z.infer<typeof LeaveReportQuerySchema>;
export type LeaveExportQuery       = z.infer<typeof LeaveExportQuerySchema>;
export type PayrollReportQuery     = z.infer<typeof PayrollReportQuerySchema>;
export type PayrollExportQuery     = z.infer<typeof PayrollExportQuerySchema>;
export type EmployeeSummaryQuery   = z.infer<typeof EmployeeSummaryQuerySchema>;
export type DepartmentSummaryQuery = z.infer<typeof DepartmentSummaryQuerySchema>;
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/admin && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/validators/report.ts
git commit -m "feat(reports): add Zod validators for 9 report endpoints"
```

---

## Task 3: ReportService — Data methods (no Excel yet)

**Files:**
- Rewrite: `apps/admin/src/services/ReportService.ts`

**Interfaces:**
- Consumes: `AttendanceReportQuery`, `LeaveReportQuery`, `PayrollReportQuery`, `EmployeeSummaryQuery`, `DepartmentSummaryQuery` from `@validators/report`
- Consumes: `AttendanceDay`, `Leave`, `PayrollRecord`, `User`, `Employee`, `AuditLog` from `src/models/`
- Produces:
  - `ReportService.attendanceReport(userId, query)` → `{ data, meta }`
  - `ReportService.leaveReport(userId, query)` → `{ data, meta }`
  - `ReportService.payrollReport(userId, query)` → `{ data, meta }`
  - `ReportService.employeeSummary(userId, query)` → `{ data }`
  - `ReportService.departmentSummary(userId, query)` → `{ data }`
  - `ReportService.dashboardSummary(userId)` → metrics object

**Important model notes:**
- `AttendanceDay.employeeId` → `User._id` (ObjectId). Use `$lookup` to join `users` collection on `_id`.
- `Leave.employeeId` → `User._id`. Same join.
- `PayrollRecord.employeeId` → `Employee._id`. But `employeeSnapshot` already has firstName/lastName/employeeId(code)/department — use snapshot directly, no join needed.
- `PayrollRecord` collection name in MongoDB = `payrollrecords` (Mongoose pluralises).
- `AttendanceDay` collection = `attendancedays`.
- `User.employeeId` = string code like "EMP001" (NOT `User._id`).

- [ ] **Step 1: Write `src/services/ReportService.ts`**

```typescript
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AttendanceDay } from '@models/AttendanceDay';
import { Leave } from '@models/Leave';
import { PayrollRecord } from '@models/PayrollRecord';
import { User } from '@models/User';
import { AuditLog } from '@models/AuditLog';
import { AppError } from '@services/AuthService';
import type {
  AttendanceReportQuery,
  AttendanceExportQuery,
  LeaveReportQuery,
  LeaveExportQuery,
  PayrollReportQuery,
  PayrollExportQuery,
  EmployeeSummaryQuery,
  DepartmentSummaryQuery,
} from '@validators/report';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  return Math.ceil(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24),
  ) + 1;
}

async function resolveEmployeeIds(
  filter: { employeeId?: string; department?: string },
): Promise<mongoose.Types.ObjectId[] | null> {
  // Returns null when no employee filter needed (return all)
  // Returns array of User._ids when department or employeeId filter applied
  if (!filter.employeeId && !filter.department) return null;

  const userFilter: Record<string, unknown> = {};
  if (filter.employeeId) userFilter._id = new mongoose.Types.ObjectId(filter.employeeId);
  if (filter.department) userFilter.department = filter.department;

  const users = await User.find(userFilter, '_id').lean() as { _id: mongoose.Types.ObjectId }[];
  return users.map((u) => u._id);
}

async function auditLog(
  userId: string,
  action: 'REPORT_VIEWED' | 'REPORT_EXPORTED',
  reportType: string,
  filters: Record<string, unknown>,
): Promise<void> {
  await AuditLog.create({
    performedBy: new mongoose.Types.ObjectId(userId),
    action,
    targetType:  'Report',
    changes:     { reportType, filters },
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ReportService {
  // ── Attendance list ─────────────────────────────────────────────────────────

  static async attendanceReport(
    userId: string,
    query: AttendanceReportQuery,
  ) {
    await connectDB();

    const days = daysBetween(query.startDate, query.endDate);
    if (days > 90) throw new AppError('REP_001', 400, 'Date range exceeds 90-day limit for paginated view.');

    const empIds = await resolveEmployeeIds({ employeeId: query.employeeId, department: query.department });

    const filter: Record<string, unknown> = {
      dateString: { $gte: query.startDate, $lte: query.endDate },
    };
    if (empIds) filter.employeeId = { $in: empIds };
    if (query.status) filter.status = query.status;

    const skip  = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      AttendanceDay.find(filter)
        .sort({ dateString: 1, employeeId: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean() as Promise<Array<{
          _id: mongoose.Types.ObjectId;
          employeeId: mongoose.Types.ObjectId;
          dateString: string;
          status: string;
          totalMinutes: number;
          overtimeMinutes: number;
          isLateArrival: boolean;
          lateByMinutes: number;
        }>>,
      AttendanceDay.countDocuments(filter),
    ]);

    // Batch-fetch user info
    const uniqueUserIds = [...new Set(docs.map((d) => d.employeeId.toHexString()))];
    const users = await User.find(
      { _id: { $in: uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      'firstName lastName employeeId department',
    ).lean() as Array<{ _id: mongoose.Types.ObjectId; firstName: string; lastName: string; employeeId: string; department?: string }>;
    const userMap = new Map(users.map((u) => [u._id.toHexString(), u]));

    const data = docs.map((d) => {
      const u = userMap.get(d.employeeId.toHexString());
      return {
        id:              d._id.toHexString(),
        employeeId:      u?.employeeId ?? d.employeeId.toHexString(),
        employeeName:    u ? `${u.firstName} ${u.lastName}` : 'Unknown',
        department:      u?.department ?? null,
        date:            d.dateString,
        status:          d.status,
        totalMinutes:    d.totalMinutes,
        overtimeMinutes: d.overtimeMinutes,
        isLateArrival:   d.isLateArrival,
        lateByMinutes:   d.lateByMinutes,
      };
    });

    void auditLog(userId, 'REPORT_VIEWED', 'attendance', query as Record<string, unknown>);

    return {
      data,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  // ── Attendance export ────────────────────────────────────────────────────────

  static async attendanceExport(
    userId: string,
    query: AttendanceExportQuery,
  ): Promise<Buffer> {
    await connectDB();

    const days = daysBetween(query.startDate, query.endDate);
    if (days > 366) throw new AppError('REP_002', 400, 'Date range exceeds 366-day limit for export.');

    const empIds = await resolveEmployeeIds({ employeeId: query.employeeId, department: query.department });

    const filter: Record<string, unknown> = {
      dateString: { $gte: query.startDate, $lte: query.endDate },
    };
    if (empIds) filter.employeeId = { $in: empIds };
    if (query.status) filter.status = query.status;

    const docs = await AttendanceDay.find(filter)
      .sort({ dateString: 1, employeeId: 1 })
      .lean() as Array<{
        _id: mongoose.Types.ObjectId;
        employeeId: mongoose.Types.ObjectId;
        dateString: string;
        status: string;
        totalMinutes: number;
        overtimeMinutes: number;
        isLateArrival: boolean;
        lateByMinutes: number;
      }>;

    const uniqueUserIds = [...new Set(docs.map((d) => d.employeeId.toHexString()))];
    const users = await User.find(
      { _id: { $in: uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      'firstName lastName employeeId department',
    ).lean() as Array<{ _id: mongoose.Types.ObjectId; firstName: string; lastName: string; employeeId: string; department?: string }>;
    const userMap = new Map(users.map((u) => [u._id.toHexString(), u]));

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance Report');
    ws.columns = [
      { header: 'Employee ID',      key: 'employeeId',      width: 14 },
      { header: 'Employee Name',     key: 'employeeName',     width: 22 },
      { header: 'Department',        key: 'department',       width: 18 },
      { header: 'Date',              key: 'date',             width: 13 },
      { header: 'Status',            key: 'status',           width: 14 },
      { header: 'Total Minutes',     key: 'totalMinutes',     width: 15 },
      { header: 'Overtime Minutes',  key: 'overtimeMinutes',  width: 17 },
      { header: 'Late Arrival',      key: 'isLateArrival',    width: 13 },
      { header: 'Late By (min)',      key: 'lateByMinutes',    width: 13 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const d of docs) {
      const u = userMap.get(d.employeeId.toHexString());
      ws.addRow({
        employeeId:      u?.employeeId ?? d.employeeId.toHexString(),
        employeeName:    u ? `${u.firstName} ${u.lastName}` : 'Unknown',
        department:      u?.department ?? '',
        date:            d.dateString,
        status:          d.status,
        totalMinutes:    d.totalMinutes,
        overtimeMinutes: d.overtimeMinutes,
        isLateArrival:   d.isLateArrival ? 'Yes' : 'No',
        lateByMinutes:   d.lateByMinutes,
      });
    }

    const buffer = await wb.xlsx.writeBuffer() as Buffer;
    void auditLog(userId, 'REPORT_EXPORTED', 'attendance', query as Record<string, unknown>);
    return buffer;
  }

  // ── Leave list ───────────────────────────────────────────────────────────────

  static async leaveReport(userId: string, query: LeaveReportQuery) {
    await connectDB();

    const empIds = await resolveEmployeeIds({ employeeId: query.employeeId, department: query.department });

    const filter: Record<string, unknown> = {};
    if (empIds) filter.employeeId = { $in: empIds };
    if (query.leaveType) filter.leaveType = query.leaveType;
    if (query.status)    filter.status    = query.status;
    if (query.leaveYear) filter.leaveYear = query.leaveYear;
    if (query.startDate) filter.startDate = { $gte: new Date(query.startDate) };
    if (query.endDate)   filter.endDate   = { ...(filter.endDate as object ?? {}), $lte: new Date(query.endDate) };

    const skip  = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      Leave.find(filter)
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean() as Promise<Array<{
          _id: mongoose.Types.ObjectId;
          employeeId: mongoose.Types.ObjectId;
          leaveType: string;
          duration: string;
          startDate: Date;
          endDate: Date;
          totalDays: number;
          leaveYear: number;
          status: string;
          reason: string;
        }>>,
      Leave.countDocuments(filter),
    ]);

    const uniqueUserIds = [...new Set(docs.map((d) => d.employeeId.toHexString()))];
    const users = await User.find(
      { _id: { $in: uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      'firstName lastName employeeId department',
    ).lean() as Array<{ _id: mongoose.Types.ObjectId; firstName: string; lastName: string; employeeId: string; department?: string }>;
    const userMap = new Map(users.map((u) => [u._id.toHexString(), u]));

    const data = docs.map((d) => {
      const u = userMap.get(d.employeeId.toHexString());
      return {
        id:           d._id.toHexString(),
        employeeId:   u?.employeeId ?? d.employeeId.toHexString(),
        employeeName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
        department:   u?.department ?? null,
        leaveType:    d.leaveType,
        duration:     d.duration,
        startDate:    d.startDate.toISOString().slice(0, 10),
        endDate:      d.endDate.toISOString().slice(0, 10),
        totalDays:    d.totalDays,
        leaveYear:    d.leaveYear,
        status:       d.status,
        reason:       d.reason,
      };
    });

    void auditLog(userId, 'REPORT_VIEWED', 'leave', query as Record<string, unknown>);
    return {
      data,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  // ── Leave export ─────────────────────────────────────────────────────────────

  static async leaveExport(userId: string, query: LeaveExportQuery): Promise<Buffer> {
    await connectDB();

    const empIds = await resolveEmployeeIds({ employeeId: query.employeeId, department: query.department });

    const filter: Record<string, unknown> = {};
    if (empIds) filter.employeeId = { $in: empIds };
    if (query.leaveType) filter.leaveType = query.leaveType;
    if (query.status)    filter.status    = query.status;
    if (query.leaveYear) filter.leaveYear = query.leaveYear;
    if (query.startDate) filter.startDate = { $gte: new Date(query.startDate) };
    if (query.endDate)   filter.endDate   = { ...(filter.endDate as object ?? {}), $lte: new Date(query.endDate) };

    const docs = await Leave.find(filter).sort({ startDate: -1 }).lean() as Array<{
      _id: mongoose.Types.ObjectId;
      employeeId: mongoose.Types.ObjectId;
      leaveType: string;
      duration: string;
      startDate: Date;
      endDate: Date;
      totalDays: number;
      leaveYear: number;
      status: string;
      reason: string;
    }>;

    const uniqueUserIds = [...new Set(docs.map((d) => d.employeeId.toHexString()))];
    const users = await User.find(
      { _id: { $in: uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      'firstName lastName employeeId department',
    ).lean() as Array<{ _id: mongoose.Types.ObjectId; firstName: string; lastName: string; employeeId: string; department?: string }>;
    const userMap = new Map(users.map((u) => [u._id.toHexString(), u]));

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Leave Report');
    ws.columns = [
      { header: 'Employee ID',   key: 'employeeId',   width: 14 },
      { header: 'Employee Name', key: 'employeeName', width: 22 },
      { header: 'Department',    key: 'department',   width: 18 },
      { header: 'Leave Type',    key: 'leaveType',    width: 14 },
      { header: 'Duration',      key: 'duration',     width: 10 },
      { header: 'Start Date',    key: 'startDate',    width: 13 },
      { header: 'End Date',      key: 'endDate',      width: 13 },
      { header: 'Total Days',    key: 'totalDays',    width: 11 },
      { header: 'Leave Year',    key: 'leaveYear',    width: 11 },
      { header: 'Status',        key: 'status',       width: 12 },
      { header: 'Reason',        key: 'reason',       width: 30 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const d of docs) {
      const u = userMap.get(d.employeeId.toHexString());
      ws.addRow({
        employeeId:   u?.employeeId ?? d.employeeId.toHexString(),
        employeeName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
        department:   u?.department ?? '',
        leaveType:    d.leaveType,
        duration:     d.duration,
        startDate:    d.startDate.toISOString().slice(0, 10),
        endDate:      d.endDate.toISOString().slice(0, 10),
        totalDays:    d.totalDays,
        leaveYear:    d.leaveYear,
        status:       d.status,
        reason:       d.reason,
      });
    }

    const buffer = await wb.xlsx.writeBuffer() as Buffer;
    void auditLog(userId, 'REPORT_EXPORTED', 'leave', query as Record<string, unknown>);
    return buffer;
  }

  // ── Payroll list ─────────────────────────────────────────────────────────────

  static async payrollReport(userId: string, query: PayrollReportQuery) {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (query.yearMonth) filter.yearMonth = query.yearMonth;
    if (query.status)    filter.status    = query.status;
    if (query.department) filter['employeeSnapshot.department'] = query.department;

    const skip  = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      PayrollRecord.find(filter)
        .sort({ yearMonth: -1, 'employeeSnapshot.lastName': 1 })
        .skip(skip)
        .limit(query.limit)
        .lean() as Promise<Array<{
          _id: mongoose.Types.ObjectId;
          yearMonth: string;
          status: string;
          employeeSnapshot: { employeeId: string; firstName: string; lastName: string; department?: string; designation?: string; monthlySalary: number };
          grossSalary: number;
          netSalary: number;
          effectivePresentDays: number;
          effectiveWorkingDays: number;
          deductionBreakdown: { totalDeductions: number };
        }>>,
      PayrollRecord.countDocuments(filter),
    ]);

    const data = docs.map((d) => ({
      id:                   d._id.toHexString(),
      yearMonth:            d.yearMonth,
      status:               d.status,
      employeeId:           d.employeeSnapshot.employeeId,
      employeeName:         `${d.employeeSnapshot.firstName} ${d.employeeSnapshot.lastName}`,
      department:           d.employeeSnapshot.department ?? null,
      designation:          d.employeeSnapshot.designation ?? null,
      grossSalary:          d.grossSalary,
      totalDeductions:      d.deductionBreakdown.totalDeductions,
      netSalary:            d.netSalary,
      effectivePresentDays: d.effectivePresentDays,
      effectiveWorkingDays: d.effectiveWorkingDays,
    }));

    void auditLog(userId, 'REPORT_VIEWED', 'payroll', query as Record<string, unknown>);
    return {
      data,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  // ── Payroll export ────────────────────────────────────────────────────────────

  static async payrollExport(userId: string, query: PayrollExportQuery): Promise<Buffer> {
    await connectDB();

    const filter: Record<string, unknown> = {};
    if (query.yearMonth) filter.yearMonth = query.yearMonth;
    if (query.status)    filter.status    = query.status;
    if (query.department) filter['employeeSnapshot.department'] = query.department;

    const docs = await PayrollRecord.find(filter)
      .sort({ yearMonth: -1, 'employeeSnapshot.lastName': 1 })
      .lean() as Array<{
        _id: mongoose.Types.ObjectId;
        yearMonth: string;
        status: string;
        employeeSnapshot: { employeeId: string; firstName: string; lastName: string; department?: string; monthlySalary: number };
        grossSalary: number;
        netSalary: number;
        effectivePresentDays: number;
        effectiveWorkingDays: number;
        halfDays: number;
        paidLeaveDays: number;
        effectiveLwpDays: number;
        absentDays: number;
        deductionBreakdown: { lwpDeduction: number; absentDeduction: number; manualDeduction: number; totalDeductions: number };
        manualDeductionRemark: string;
      }>;

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payroll Report');
    ws.columns = [
      { header: 'Month',           key: 'yearMonth',          width: 10 },
      { header: 'Status',          key: 'status',             width: 11 },
      { header: 'Employee ID',     key: 'employeeId',         width: 14 },
      { header: 'Employee Name',   key: 'employeeName',       width: 22 },
      { header: 'Department',      key: 'department',         width: 18 },
      { header: 'Working Days',    key: 'workingDays',        width: 13 },
      { header: 'Present Days',    key: 'presentDays',        width: 13 },
      { header: 'Half Days',       key: 'halfDays',           width: 10 },
      { header: 'Paid Leave Days', key: 'paidLeaveDays',      width: 15 },
      { header: 'LWP Days',        key: 'lwpDays',            width: 10 },
      { header: 'Absent Days',     key: 'absentDays',         width: 11 },
      { header: 'Gross Salary',    key: 'grossSalary',        width: 13 },
      { header: 'Total Deductions',key: 'totalDeductions',    width: 17 },
      { header: 'Net Salary',      key: 'netSalary',          width: 13 },
      { header: 'Deduction Remark',key: 'deductionRemark',    width: 20 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const d of docs) {
      const label = d.status === 'draft' ? 'DRAFT' : 'Finalised';
      ws.addRow({
        yearMonth:       d.yearMonth,
        status:          label,
        employeeId:      d.employeeSnapshot.employeeId,
        employeeName:    `${d.employeeSnapshot.firstName} ${d.employeeSnapshot.lastName}`,
        department:      d.employeeSnapshot.department ?? '',
        workingDays:     d.effectiveWorkingDays,
        presentDays:     d.effectivePresentDays,
        halfDays:        d.halfDays,
        paidLeaveDays:   d.paidLeaveDays,
        lwpDays:         d.effectiveLwpDays,
        absentDays:      d.absentDays,
        grossSalary:     d.grossSalary,
        totalDeductions: d.deductionBreakdown.totalDeductions,
        netSalary:       d.netSalary,
        deductionRemark: d.manualDeductionRemark ?? '',
      });
    }

    const buffer = await wb.xlsx.writeBuffer() as Buffer;
    void auditLog(userId, 'REPORT_EXPORTED', 'payroll', query as Record<string, unknown>);
    return buffer;
  }

  // ── Employee summary ──────────────────────────────────────────────────────────

  static async employeeSummary(userId: string, query: EmployeeSummaryQuery) {
    await connectDB();

    const userFilter: Record<string, unknown> = { role: 'employee' };
    if (query.employeeId) userFilter._id = new mongoose.Types.ObjectId(query.employeeId);
    if (query.department) userFilter.department = query.department;

    const users = await User.find(userFilter, 'firstName lastName employeeId department designation leaveBalances isActive').lean() as Array<{
      _id: mongoose.Types.ObjectId;
      firstName: string;
      lastName: string;
      employeeId: string;
      department?: string;
      designation?: string;
      leaveBalances: {
        paidLeave: { currentYear: number; carriedForward: number };
        sickLeave: { currentYear: number; carriedForward: number };
        casualLeave: { currentYear: number; carriedForward: number };
      };
      isActive: boolean;
    }>;

    const userIds = users.map((u) => u._id);

    const attFilter: Record<string, unknown> = { employeeId: { $in: userIds } };
    if (query.year)  attFilter.year  = query.year;
    if (query.month) attFilter.month = query.month;

    type AttAggResult = { _id: mongoose.Types.ObjectId; present: number; absent: number; halfDay: number; leave: number; lwp: number; totalOvertime: number };
    const attAgg = await AttendanceDay.aggregate<AttAggResult>([
      { $match: attFilter },
      {
        $group: {
          _id:           '$employeeId',
          present:       { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent:        { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          halfDay:       { $sum: { $cond: [{ $eq: ['$status', 'half-day'] }, 1, 0] } },
          leave:         { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
          lwp:           { $sum: { $cond: [{ $eq: ['$status', 'lwp'] }, 1, 0] } },
          totalOvertime: { $sum: '$overtimeMinutes' },
        },
      },
    ]);
    const attMap = new Map(attAgg.map((a) => [a._id.toHexString(), a]));

    const data = users.map((u) => {
      const att = attMap.get(u._id.toHexString());
      return {
        employeeId:   u.employeeId,
        employeeName: `${u.firstName} ${u.lastName}`,
        department:   u.department ?? null,
        designation:  u.designation ?? null,
        isActive:     u.isActive,
        attendance: {
          presentDays:      att?.present ?? 0,
          absentDays:       att?.absent ?? 0,
          halfDays:         att?.halfDay ?? 0,
          leaveDays:        att?.leave ?? 0,
          lwpDays:          att?.lwp ?? 0,
          totalOvertimeMin: att?.totalOvertime ?? 0,
        },
        leaveBalances: {
          paidLeave:   { currentYear: u.leaveBalances.paidLeave.currentYear, carriedForward: u.leaveBalances.paidLeave.carriedForward },
          sickLeave:   { currentYear: u.leaveBalances.sickLeave.currentYear, carriedForward: u.leaveBalances.sickLeave.carriedForward },
          casualLeave: { currentYear: u.leaveBalances.casualLeave.currentYear, carriedForward: u.leaveBalances.casualLeave.carriedForward },
        },
      };
    });

    void auditLog(userId, 'REPORT_VIEWED', 'employee-summary', query as Record<string, unknown>);
    return { data };
  }

  // ── Department summary ────────────────────────────────────────────────────────

  static async departmentSummary(userId: string, query: DepartmentSummaryQuery) {
    await connectDB();

    // Get all employees grouped by department
    const users = await User.find({ role: 'employee' }, 'department isActive').lean() as Array<{
      _id: mongoose.Types.ObjectId;
      department?: string;
      isActive: boolean;
    }>;

    const userIds = users.map((u) => u._id);

    const attFilter: Record<string, unknown> = { employeeId: { $in: userIds } };
    if (query.year)  attFilter.year  = query.year;
    if (query.month) attFilter.month = query.month;

    type AttDeptAgg = { _id: mongoose.Types.ObjectId; status: string };
    const attDocs = await AttendanceDay.find(attFilter, 'employeeId status').lean() as AttDeptAgg[];

    const leaveFilter: Record<string, unknown> = {
      employeeId: { $in: userIds },
      status:     'approved',
    };
    if (query.year) leaveFilter.leaveYear = query.year;

    type LeaveDeptAgg = { _id: mongoose.Types.ObjectId; totalDays: number };
    const leaveDocs = await Leave.find(leaveFilter, 'employeeId totalDays').lean() as LeaveDeptAgg[];

    // Map userId → department
    const userDeptMap = new Map(users.map((u) => [u._id.toHexString(), u.department ?? 'Unassigned']));
    const userActiveMap = new Map(users.map((u) => [u._id.toHexString(), u.isActive]));

    // Build department buckets
    const deptMap = new Map<string, { total: number; active: number; presentDays: number; totalDays: number; leaveDays: number }>();

    for (const u of users) {
      const dept = userDeptMap.get(u._id.toHexString()) ?? 'Unassigned';
      if (!deptMap.has(dept)) deptMap.set(dept, { total: 0, active: 0, presentDays: 0, totalDays: 0, leaveDays: 0 });
      const bucket = deptMap.get(dept)!;
      bucket.total += 1;
      if (userActiveMap.get(u._id.toHexString())) bucket.active += 1;
    }

    for (const a of attDocs) {
      const dept = userDeptMap.get(a._id.toHexString()) ?? 'Unassigned';
      if (!deptMap.has(dept)) continue;
      const bucket = deptMap.get(dept)!;
      bucket.totalDays += 1;
      if (a.status === 'present' || a.status === 'half-day') bucket.presentDays += 1;
    }

    for (const l of leaveDocs) {
      const dept = userDeptMap.get(l._id.toHexString()) ?? 'Unassigned';
      if (!deptMap.has(dept)) continue;
      deptMap.get(dept)!.leaveDays += l.totalDays;
    }

    const data = Array.from(deptMap.entries()).map(([department, stats]) => ({
      department,
      totalEmployees:  stats.total,
      activeEmployees: stats.active,
      attendanceRate:  stats.totalDays > 0
        ? Math.round((stats.presentDays / stats.totalDays) * 100 * 100) / 100
        : null,
      totalLeaveDaysTaken: stats.leaveDays,
    })).sort((a, b) => a.department.localeCompare(b.department));

    void auditLog(userId, 'REPORT_VIEWED', 'department-summary', query as Record<string, unknown>);
    return { data };
  }

  // ── Dashboard summary ─────────────────────────────────────────────────────────

  static async dashboardSummary(userId: string) {
    await connectDB();

    const today = new Date();
    const dateString = today.toISOString().slice(0, 10);
    const yearMonth  = dateString.slice(0, 7);

    const [
      totalEmployees,
      activeEmployees,
      todayPresent,
      todayAbsent,
      pendingLeaves,
      pendingRegularizations,
      payrollDraft,
      payrollFinalised,
    ] = await Promise.all([
      User.countDocuments({ role: 'employee' }),
      User.countDocuments({ role: 'employee', isActive: true }),
      AttendanceDay.countDocuments({ dateString, status: 'present' }),
      AttendanceDay.countDocuments({ dateString, status: 'absent' }),
      // Leave model import needed — use direct query
      mongoose.connection.collection('leaves').countDocuments({ status: 'pending' }),
      mongoose.connection.collection('regularizations').countDocuments({ status: 'pending' }),
      PayrollRecord.countDocuments({ yearMonth, status: 'draft' }),
      PayrollRecord.countDocuments({ yearMonth, status: 'finalised' }),
    ]);

    void auditLog(userId, 'REPORT_VIEWED', 'dashboard-summary', {});
    return {
      employees: { total: totalEmployees, active: activeEmployees, inactive: totalEmployees - activeEmployees },
      todayAttendance: { present: todayPresent, absent: todayAbsent, date: dateString },
      pendingApprovals: { leaves: pendingLeaves, regularizations: pendingRegularizations },
      payroll: { yearMonth, draft: payrollDraft, finalised: payrollFinalised },
    };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/admin && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors (fix any that appear).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/services/ReportService.ts
git commit -m "feat(reports): implement ReportService with 9 report/export methods"
```

---

## Task 4: Route handlers

**Files:**
- Create: `apps/admin/src/app/api/v1/reports/attendance/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/attendance/export/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/leave/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/leave/export/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/payroll/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/payroll/export/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/employee-summary/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/department-summary/route.ts`
- Create: `apps/admin/src/app/api/v1/reports/dashboard-summary/route.ts`

**Interfaces:**
- Consumes: `ReportService.*` from `@services/ReportService`
- Consumes: `assertRole` from `@mw/requireRole`
- Produces: JSON `{ success: true, data, meta? }` for lists; binary `Buffer` for exports

**Pattern for list routes:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { XxxQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = XxxQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const result = await ReportService.xxx(payload.userId, query);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

**Pattern for export routes (binary response):**
```typescript
// Same auth + role + validation pattern
// Then:
try {
  const buffer = await ReportService.xxxExport(payload.userId, query);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="xxx-report-${query.startDate ?? 'all'}.xlsx"`,
    },
  });
} catch (err) {
  if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
  throw err;
}
```

- [ ] **Step 1: Create `reports/attendance/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AttendanceReportQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = AttendanceReportQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const result = await ReportService.attendanceReport(payload.userId, query);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 2: Create `reports/attendance/export/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AttendanceExportQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = AttendanceExportQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const buffer = await ReportService.attendanceExport(payload.userId, query);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="attendance-report-${query.startDate}-to-${query.endDate}.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 3: Create `reports/leave/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { LeaveReportQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = LeaveReportQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const result = await ReportService.leaveReport(payload.userId, query);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 4: Create `reports/leave/export/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { LeaveExportQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = LeaveExportQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const buffer = await ReportService.leaveExport(payload.userId, query);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leave-report.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 5: Create `reports/payroll/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PayrollReportQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = PayrollReportQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const result = await ReportService.payrollReport(payload.userId, query);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 6: Create `reports/payroll/export/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PayrollExportQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = PayrollExportQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const buffer = await ReportService.payrollExport(payload.userId, query);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="payroll-report${query.yearMonth ? `-${query.yearMonth}` : ''}.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 7: Create `reports/employee-summary/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { EmployeeSummaryQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = EmployeeSummaryQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const result = await ReportService.employeeSummary(payload.userId, query);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 8: Create `reports/department-summary/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DepartmentSummaryQuerySchema } from '@validators/report';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try { query = DepartmentSummaryQuerySchema.parse(sp); }
  catch (err) {
    if (err instanceof ZodError) return apiError('GEN_001', 'Validation failed.', 400);
    throw err;
  }
  try {
    const result = await ReportService.departmentSummary(payload.userId, query);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 9: Create `reports/dashboard-summary/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ReportService } from '@services/ReportService';
import { AppError } from '@services/AuthService';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) {
    if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus);
    throw err;
  }
  try { assertRole(payload, 'admin'); }
  catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
  try {
    const result = await ReportService.dashboardSummary(payload.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    throw err;
  }
}
```

- [ ] **Step 10: Typecheck**

```bash
cd apps/admin && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any that appear.

- [ ] **Step 11: Commit**

```bash
git add apps/admin/src/app/api/v1/reports/
git commit -m "feat(reports): add 9 report route handlers (attendance, leave, payroll, summaries)"
```

---

## Task 5: Unit Tests

**Files:**
- Create: `apps/admin/src/__tests__/reports/ReportService.test.ts`

**Interfaces:**
- Tests mock: `AttendanceDay`, `Leave`, `PayrollRecord`, `User`, `AuditLog` via `jest.spyOn`
- Tests mock: `exceljs` module
- Tests call: `ReportService.*` static methods directly

- [ ] **Step 1: Write `src/__tests__/reports/ReportService.test.ts`**

```typescript
import mongoose from 'mongoose';
import { AttendanceDay } from '@models/AttendanceDay';
import { Leave }         from '@models/Leave';
import { PayrollRecord } from '@models/PayrollRecord';
import { User }          from '@models/User';
import { AuditLog }      from '@models/AuditLog';
import { ReportService } from '@services/ReportService';

jest.mock('@lib/db/connect', () => ({ connectDB: jest.fn() }));
jest.mock('exceljs', () => {
  const mockWrite = jest.fn().mockResolvedValue(Buffer.from('xlsx'));
  const mockWs = {
    columns: [],
    getRow: jest.fn().mockReturnValue({ font: {} }),
    addRow: jest.fn(),
  };
  const mockWb = {
    addWorksheet: jest.fn().mockReturnValue(mockWs),
    xlsx: { writeBuffer: mockWrite },
  };
  return { default: jest.fn().mockImplementation(() => mockWb) };
});

const ADMIN_ID = new mongoose.Types.ObjectId().toHexString();
const EMP_ID   = new mongoose.Types.ObjectId();
const EMP_ID2  = new mongoose.Types.ObjectId();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
});

// ─── U-REP-01: attendanceReport returns paginated data ──────────────────────
describe('U-REP-01: attendanceReport — paginated list', () => {
  it('returns formatted rows with employee name from User lookup', async () => {
    const fakeDay = {
      _id: new mongoose.Types.ObjectId(),
      employeeId: EMP_ID,
      dateString: '2026-06-01',
      status: 'present',
      totalMinutes: 480,
      overtimeMinutes: 30,
      isLateArrival: false,
      lateByMinutes: 0,
    };
    jest.spyOn(User, 'find').mockResolvedValue([
      { _id: EMP_ID, firstName: 'Alice', lastName: 'Smith', employeeId: 'EMP001', department: 'Eng' },
    ] as never);
    jest.spyOn(AttendanceDay, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([fakeDay]) }) }) }),
    } as never);
    jest.spyOn(AttendanceDay, 'countDocuments').mockResolvedValue(1 as never);

    const result = await ReportService.attendanceReport(ADMIN_ID, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].employeeName).toBe('Alice Smith');
    expect(result.data[0].employeeId).toBe('EMP001');
    expect(result.data[0].status).toBe('present');
    expect(result.meta.total).toBe(1);
  });
});

// ─── U-REP-02: attendanceReport date range > 90 days throws ─────────────────
describe('U-REP-02: attendanceReport — 90-day limit', () => {
  it('throws AppError REP_001 when range exceeds 90 days', async () => {
    await expect(
      ReportService.attendanceReport(ADMIN_ID, {
        startDate: '2026-01-01',
        endDate: '2026-06-01',
        page: 1,
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: 'REP_001', httpStatus: 400 });
  });
});

// ─── U-REP-03: attendanceExport > 366 days throws ────────────────────────────
describe('U-REP-03: attendanceExport — 366-day limit', () => {
  it('throws AppError REP_002 when range exceeds 366 days', async () => {
    await expect(
      ReportService.attendanceExport(ADMIN_ID, {
        startDate: '2024-01-01',
        endDate: '2025-06-01',
      }),
    ).rejects.toMatchObject({ code: 'REP_002', httpStatus: 400 });
  });
});

// ─── U-REP-04: attendanceExport returns Buffer ────────────────────────────────
describe('U-REP-04: attendanceExport — returns Buffer', () => {
  it('returns a Buffer for valid date range', async () => {
    jest.spyOn(User, 'find').mockResolvedValue([] as never);
    jest.spyOn(AttendanceDay, 'find').mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve([]) }),
    } as never);

    const buffer = await ReportService.attendanceExport(ADMIN_ID, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});

// ─── U-REP-05: leaveReport returns paginated leave rows ──────────────────────
describe('U-REP-05: leaveReport — paginated list', () => {
  it('returns formatted leave rows', async () => {
    const fakeLeave = {
      _id: new mongoose.Types.ObjectId(),
      employeeId: EMP_ID,
      leaveType: 'paidLeave',
      duration: 'full',
      startDate: new Date('2026-06-10'),
      endDate: new Date('2026-06-12'),
      totalDays: 3,
      leaveYear: 2026,
      status: 'approved',
      reason: 'Vacation',
    };
    jest.spyOn(User, 'find').mockResolvedValue([
      { _id: EMP_ID, firstName: 'Bob', lastName: 'Jones', employeeId: 'EMP002', department: 'HR' },
    ] as never);
    jest.spyOn(Leave, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([fakeLeave]) }) }) }),
    } as never);
    jest.spyOn(Leave, 'countDocuments').mockResolvedValue(1 as never);

    const result = await ReportService.leaveReport(ADMIN_ID, { page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].leaveType).toBe('paidLeave');
    expect(result.data[0].employeeName).toBe('Bob Jones');
    expect(result.data[0].totalDays).toBe(3);
  });
});

// ─── U-REP-06: payrollReport marks draft rows ───────────────────────────────
describe('U-REP-06: payrollReport — data shaping', () => {
  it('returns payroll rows using employeeSnapshot data', async () => {
    const fakeRecord = {
      _id: new mongoose.Types.ObjectId(),
      yearMonth: '2026-06',
      status: 'draft',
      employeeSnapshot: {
        employeeId: 'EMP001',
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Eng',
        monthlySalary: 50000,
      },
      grossSalary: 50000,
      netSalary: 47000,
      effectivePresentDays: 22,
      effectiveWorkingDays: 26,
      deductionBreakdown: { totalDeductions: 3000 },
    };
    jest.spyOn(PayrollRecord, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([fakeRecord]) }) }) }),
    } as never);
    jest.spyOn(PayrollRecord, 'countDocuments').mockResolvedValue(1 as never);

    const result = await ReportService.payrollReport(ADMIN_ID, { page: 1, limit: 20 });

    expect(result.data[0].status).toBe('draft');
    expect(result.data[0].employeeName).toBe('Alice Smith');
    expect(result.data[0].netSalary).toBe(47000);
  });
});

// ─── U-REP-07: payrollExport labels draft rows 'DRAFT' ───────────────────────
describe('U-REP-07: payrollExport — DRAFT label', () => {
  it('adds DRAFT label for draft records and returns Buffer', async () => {
    const fakeRecord = {
      _id: new mongoose.Types.ObjectId(),
      yearMonth: '2026-06',
      status: 'draft',
      employeeSnapshot: { employeeId: 'EMP001', firstName: 'Alice', lastName: 'Smith', department: 'Eng', monthlySalary: 50000 },
      grossSalary: 50000,
      netSalary: 47000,
      effectiveWorkingDays: 26,
      effectivePresentDays: 22,
      halfDays: 0,
      paidLeaveDays: 2,
      effectiveLwpDays: 0,
      absentDays: 2,
      deductionBreakdown: { lwpDeduction: 0, absentDeduction: 3000, manualDeduction: 0, totalDeductions: 3000 },
      manualDeductionRemark: '',
    };
    jest.spyOn(PayrollRecord, 'find').mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve([fakeRecord]) }),
    } as never);

    const ExcelJS = (await import('exceljs')).default as jest.Mock;
    const mockWb = ExcelJS.mock.results[ExcelJS.mock.results.length - 1]?.value ?? ExcelJS();
    const mockWs = mockWb.addWorksheet('Payroll Report');

    await ReportService.payrollExport(ADMIN_ID, {});

    // addRow was called with status='DRAFT'
    const calls = (mockWs.addRow as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].status).toBe('DRAFT');
  });
});

// ─── U-REP-08: employeeSummary returns per-employee stats ────────────────────
describe('U-REP-08: employeeSummary — aggregation', () => {
  it('returns employee list with attendance and leave balance', async () => {
    jest.spyOn(User, 'find').mockResolvedValue([
      {
        _id: EMP_ID,
        firstName: 'Alice', lastName: 'Smith',
        employeeId: 'EMP001', department: 'Eng', designation: 'Dev',
        isActive: true,
        leaveBalances: {
          paidLeave:   { currentYear: 10, carriedForward: 2 },
          sickLeave:   { currentYear: 5,  carriedForward: 0 },
          casualLeave: { currentYear: 3,  carriedForward: 0 },
        },
      },
    ] as never);
    jest.spyOn(AttendanceDay, 'aggregate').mockResolvedValue([
      { _id: EMP_ID, present: 20, absent: 2, halfDay: 1, leave: 3, lwp: 0, totalOvertime: 60 },
    ] as never);

    const result = await ReportService.employeeSummary(ADMIN_ID, {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0].attendance.presentDays).toBe(20);
    expect(result.data[0].leaveBalances.paidLeave.currentYear).toBe(10);
  });
});

// ─── U-REP-09: departmentSummary groups by department ────────────────────────
describe('U-REP-09: departmentSummary — grouping', () => {
  it('returns attendance rate per department', async () => {
    jest.spyOn(User, 'find').mockResolvedValue([
      { _id: EMP_ID,  department: 'Engineering', isActive: true },
      { _id: EMP_ID2, department: 'Engineering', isActive: true },
    ] as never);
    jest.spyOn(AttendanceDay, 'find').mockReturnValue({
      lean: () => Promise.resolve([
        { _id: EMP_ID,  status: 'present' },
        { _id: EMP_ID2, status: 'absent'  },
      ]),
    } as never);
    jest.spyOn(Leave, 'find').mockReturnValue({
      lean: () => Promise.resolve([]),
    } as never);

    const result = await ReportService.departmentSummary(ADMIN_ID, {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0].department).toBe('Engineering');
    expect(result.data[0].totalEmployees).toBe(2);
    expect(result.data[0].attendanceRate).toBe(50);
  });
});

// ─── U-REP-10: dashboardSummary returns count metrics ────────────────────────
describe('U-REP-10: dashboardSummary — metrics', () => {
  it('returns employee and attendance counts', async () => {
    jest.spyOn(User, 'countDocuments')
      .mockResolvedValueOnce(10 as never) // total employees
      .mockResolvedValueOnce(8 as never);  // active employees
    jest.spyOn(AttendanceDay, 'countDocuments')
      .mockResolvedValueOnce(7 as never)   // present today
      .mockResolvedValueOnce(1 as never);  // absent today
    jest.spyOn(PayrollRecord, 'countDocuments')
      .mockResolvedValueOnce(3 as never)   // draft
      .mockResolvedValueOnce(7 as never);  // finalised

    // Mock mongoose.connection.collection for pending leaves/regularizations
    const mockCollection = {
      countDocuments: jest.fn()
        .mockResolvedValueOnce(5)  // pending leaves
        .mockResolvedValueOnce(2), // pending regularizations
    };
    jest.spyOn(mongoose.connection, 'collection').mockReturnValue(mockCollection as never);

    const result = await ReportService.dashboardSummary(ADMIN_ID);

    expect(result.employees.total).toBe(10);
    expect(result.employees.active).toBe(8);
    expect(result.todayAttendance.present).toBe(7);
    expect(result.pendingApprovals.leaves).toBe(5);
    expect(result.payroll.draft).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/admin && npx jest --testPathPattern="reports/ReportService" --forceExit 2>&1 | tail -20
```

Expected: 10 tests pass. Fix any failures before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/__tests__/reports/ReportService.test.ts
git commit -m "test(reports): add 10 unit tests for ReportService"
```

---

## Task 6: Quality Gates

- [ ] **Step 1: Run full test suite**

```bash
cd apps/admin && npx jest --forceExit 2>&1 | tail -20
```

Expected: all prior tests still pass + 10 new report tests.

- [ ] **Step 2: Lint**

```bash
cd apps/admin && npx eslint . --max-warnings 0 2>&1 | tail -20
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Typecheck**

```bash
cd apps/admin && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 4: Build**

```bash
cd apps/admin && npx next build 2>&1 | tail -20
```

Expected: successful build.

- [ ] **Step 5: Fix any gate failures, commit fixes**

Fix → stage → commit. Never skip a gate.

---

## Task 7: Implementation Report

- [ ] **Step 1: Create `docs/17-reports-implementation-report.md`**

Include: files created, files modified, 9 endpoints, 10 tests, remaining tasks, gate status.

- [ ] **Step 2: Commit**

```bash
git add docs/17-reports-implementation-report.md
git commit -m "docs: add Phase 9 reports implementation report"
```
