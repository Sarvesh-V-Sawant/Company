# Attendance Validation Mode + Field Tracking + Configurable Payroll Rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add attendanceValidationMode (geofence|officeIp) + IP allowlist, location history admin UI, and configurable half-day aggregation payroll rules with explainable breakdown.

**Architecture:** Three independent subsystems wired through CompanySettings. Validation mode is read at check-in time; payroll rules are read at compute time; location history uses the existing LocationSnapshot API with a new page. All new schema fields are optional with safe defaults so existing deployments need no migration.

**Tech Stack:** Next.js 15 App Router, Mongoose (MongoDB Atlas), React Hook Form + Zod, SWR, Tailwind, Flutter/Dart, Dio

## Global Constraints

- No `.env*` changes, no Vercel env changes, no credential rotation
- No force-push, no history rewrite, no destructive DB migration
- All new Mongoose fields: optional with defaults (safe for existing documents)
- `ATT_002` already taken (GPS accuracy) — use `ATT_003` for office IP validation
- `allowOutsideGeofence` employees bypass ALL validation modes (geofence and IP)
- Do not remove or change existing geofence validation logic — add IP mode alongside it
- Do not rewrite PayrollService aggregation loop — augment it
- Admin error UX: toast (sonner), never raw error objects
- Mobile error UX: SnackBar with server message; specific bottom-sheet only for ATT_001 and ATT_003

---

## File Map

**Modified files:**
- `apps/admin/src/models/CompanySettings.ts` — add `attendanceValidationMode`, `allowedOfficeIps`, `payrollRules`
- `apps/admin/src/types/api.ts` — extend `Settings` and `PayrollRecord` types
- `apps/admin/src/app/api/v1/settings/route.ts` — add PATCH/GET keys for new fields
- `apps/admin/src/services/SettingsService.ts` — add `updateAttendanceValidation`, `updatePayrollRules`
- `apps/admin/src/services/AttendanceService.ts` — add IP validation branch, pass clientIp
- `apps/admin/src/app/api/v1/attendance/checkin/route.ts` — extract + pass clientIp
- `apps/admin/src/models/PayrollRecord.ts` — add `lateMarkCount`, `halfDayDeductionDays`, `halfDayDeduction` to breakdown
- `apps/admin/src/engines/PayrollEngine.ts` — add halfDayAggregation input/output
- `apps/admin/src/services/PayrollService.ts` — count lateMarkCount, compute halfDayAggregation
- `apps/admin/src/app/(portal)/payroll/[yearMonth]/[id]/page.tsx` — add breakdown section
- `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` — handle ATT_003

**New files:**
- `apps/admin/src/app/(portal)/settings/attendance-validation/page.tsx` — admin UI for validation mode
- `apps/admin/src/components/forms/SettingsAttendanceValidationForm.tsx` — form component
- `apps/admin/src/app/(portal)/attendance/location-history/page.tsx` — location snapshot history

---

## Task 1: CompanySettings model — new fields

**Files:**
- Modify: `apps/admin/src/models/CompanySettings.ts`

**Interfaces:** Produces `IPayrollRules`, extends `ICompanySettings` with three new optional fields

- [ ] **Step 1: Add interfaces and schema fields**

Open `apps/admin/src/models/CompanySettings.ts`. After the `IStatutoryConfig` interface (line ~60) and before `ICompanySettings`, add:

```typescript
export interface IPayrollRules {
  halfDayAggregationCount: number; // 0 = disabled; N>=2 = N half-days → 1 deduction day
}
```

In `ICompanySettings` interface, add three optional fields after `statutoryConfig?`:

```typescript
  attendanceValidationMode?: 'geofence' | 'officeIp';
  allowedOfficeIps?: string[];
  payrollRules?: IPayrollRules;
```

In `CompanySettingsSchema`, add after the `statutoryConfig` sub-document:

```typescript
  attendanceValidationMode: { type: String, enum: ['geofence', 'officeIp'], default: 'geofence' },
  allowedOfficeIps: [{ type: String }],
  payrollRules: {
    halfDayAggregationCount: { type: Number, default: 0, min: 0 },
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd apps/admin; npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "validator.ts" | head -20
```

Expected: zero errors (the validator.ts warning is pre-existing and safe to ignore).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/models/CompanySettings.ts
git commit -m "feat(settings): add attendanceValidationMode, allowedOfficeIps, payrollRules to CompanySettings"
```

---

## Task 2: Settings API + Service — new fields

**Files:**
- Modify: `apps/admin/src/services/SettingsService.ts`
- Modify: `apps/admin/src/app/api/v1/settings/route.ts`
- Modify: `apps/admin/src/types/api.ts`

**Interfaces:**
- Consumes: `ICompanySettings` with new optional fields from Task 1
- Produces: extended `Settings` type; `updateAttendanceValidation()` and `updatePayrollRules()` service methods

- [ ] **Step 1: Add service methods**

In `apps/admin/src/services/SettingsService.ts`, add after `updateStatutory`:

```typescript
  static async updateAttendanceValidation(data: {
    attendanceValidationMode?: 'geofence' | 'officeIp';
    allowedOfficeIps?: string[];
  }) {
    await connectDB();
    const $set: Record<string, unknown> = {};
    if (data.attendanceValidationMode !== undefined)
      $set.attendanceValidationMode = data.attendanceValidationMode;
    if (data.allowedOfficeIps !== undefined)
      $set.allowedOfficeIps = data.allowedOfficeIps;
    if (Object.keys($set).length === 0) throw new AppError('GEN_001', 400, 'No fields to update.');
    const updated = await CompanySettings.findByIdAndUpdate(
      'company-settings',
      { $set },
      { new: true, runValidators: true },
    ).lean() as (ICompanySettings & { _id: string }) | null;
    if (!updated) throw new AppError('GEN_004', 404, 'Company settings not yet configured.');
    return updated;
  }

  static async updatePayrollRules(data: { halfDayAggregationCount?: number }) {
    await connectDB();
    const $set: Record<string, unknown> = {};
    if (data.halfDayAggregationCount !== undefined)
      $set['payrollRules.halfDayAggregationCount'] = data.halfDayAggregationCount;
    if (Object.keys($set).length === 0) throw new AppError('GEN_001', 400, 'No fields to update.');
    const updated = await CompanySettings.findByIdAndUpdate(
      'company-settings',
      { $set },
      { new: true, runValidators: true },
    ).lean() as (ICompanySettings & { _id: string }) | null;
    if (!updated) throw new AppError('GEN_004', 404, 'Company settings not yet configured.');
    return updated;
  }
```

- [ ] **Step 2: Extend settings API route**

In `apps/admin/src/app/api/v1/settings/route.ts`, extend `PatchBodySchema` with two new optional keys after the `workingDays` line:

```typescript
  attendanceValidation: z.object({
    mode: z.enum(['geofence', 'officeIp']),
    allowedOfficeIps: z.array(z.string().ip({ version: 'v4' })).max(20),
  }).optional(),
  payrollRules: z.object({
    halfDayAggregationCount: z.number().int().min(0).max(31),
  }).optional(),
```

Extend the `toShape` function to include the new fields:

```typescript
function toShape(s: Awaited<ReturnType<typeof SettingsService.getSettings>>) {
  return {
    company: {
      name:     s.companyName,
      timezone: s.timezone,
      currency: s.currency,
    },
    workingDays: s.workingDays,
    shift: {
      startTime:          s.workStartTime,
      endTime:            s.workEndTime,
      gracePeriodMinutes: s.lateArrivalGraceMinutes,
    },
    geofence: {
      lat:          s.geoFence.latitude,
      lng:          s.geoFence.longitude,
      radiusMeters: s.geoFence.radiusMeters,
      enabled:      s.geoFence.isEnabled,
    },
    attendanceValidation: {
      mode:            s.attendanceValidationMode ?? 'geofence',
      allowedOfficeIps: s.allowedOfficeIps ?? [],
    },
    payrollRules: {
      halfDayAggregationCount: s.payrollRules?.halfDayAggregationCount ?? 0,
    },
  };
}
```

In the `PATCH` handler, after the `if (parsed.workingDays)` block, add:

```typescript
    if (parsed.attendanceValidation)
      ops.push(SettingsService.updateAttendanceValidation({
        attendanceValidationMode: parsed.attendanceValidation.mode,
        allowedOfficeIps:         parsed.attendanceValidation.allowedOfficeIps,
      }));

    if (parsed.payrollRules)
      ops.push(SettingsService.updatePayrollRules({
        halfDayAggregationCount: parsed.payrollRules.halfDayAggregationCount,
      }));
```

- [ ] **Step 3: Extend Settings type in api.ts**

In `apps/admin/src/types/api.ts`, extend `interface Settings` after the `geofence?` block:

```typescript
  attendanceValidation?: {
    mode: 'geofence' | 'officeIp';
    allowedOfficeIps: string[];
  };
  payrollRules?: {
    halfDayAggregationCount: number;
  };
```

- [ ] **Step 4: Verify TypeScript**

```powershell
cd apps/admin; npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "validator.ts" | head -20
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/services/SettingsService.ts \
        apps/admin/src/app/api/v1/settings/route.ts \
        apps/admin/src/types/api.ts
git commit -m "feat(settings): API + service for attendanceValidationMode, officeIps, payrollRules"
```

---

## Task 3: Admin "Attendance Validation" settings page

**Files:**
- Create: `apps/admin/src/components/forms/SettingsAttendanceValidationForm.tsx`
- Create: `apps/admin/src/app/(portal)/settings/attendance-validation/page.tsx`

**Interfaces:**
- Consumes: `Settings` with `attendanceValidation` field from Task 2
- Produces: PATCH `/api/v1/settings` with `attendanceValidation` body

- [ ] **Step 1: Create the form component**

Create `apps/admin/src/components/forms/SettingsAttendanceValidationForm.tsx`:

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { X, Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

const schema = z.object({
  mode: z.enum(['geofence', 'officeIp']),
  allowedOfficeIps: z.array(z.string()).max(20),
});
type Form = z.infer<typeof schema>;

interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsAttendanceValidationForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [newIp, setNewIp] = useState('');

  const { register, handleSubmit, reset, control, setValue, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: settings?.attendanceValidation?.mode ?? 'geofence',
      allowedOfficeIps: settings?.attendanceValidation?.allowedOfficeIps ?? [],
    },
  });

  useEffect(() => {
    if (settings?.attendanceValidation) {
      reset({
        mode: settings.attendanceValidation.mode,
        allowedOfficeIps: settings.attendanceValidation.allowedOfficeIps,
      });
    }
  }, [settings, reset]);

  const mode = useWatch({ control, name: 'mode' });
  const ips = watch('allowedOfficeIps');

  const addIp = () => {
    const trimmed = newIp.trim();
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4.test(trimmed)) { toast.error('Enter a valid IPv4 address'); return; }
    if (ips.includes(trimmed)) { toast.error('IP already in list'); return; }
    setValue('allowedOfficeIps', [...ips, trimmed]);
    setNewIp('');
  };

  const removeIp = (ip: string) => {
    setValue('allowedOfficeIps', ips.filter(x => x !== ip));
  };

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ attendanceValidation: data }),
      });
      toast.success('Attendance validation settings updated');
      onSuccess?.();
    } catch { toast.error('Failed to update settings'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 max-w-md">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Validation mode</p>
        <div className="space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="radio" value="geofence" {...register('mode')} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">GPS Geofence</p>
              <p className="text-xs text-gray-500">Employee must be within the configured radius at check-in.</p>
            </div>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="radio" value="officeIp" {...register('mode')} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Office Network / IP</p>
              <p className="text-xs text-gray-500">Employee must connect from an approved office IP address.</p>
            </div>
          </label>
        </div>
        <p className="mt-2 text-xs text-amber-600">Field/sales employees with "Allow Outside Geofence" bypass both modes.</p>
      </div>

      {mode === 'officeIp' && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Approved office IP addresses (IPv4)</p>
          <div className="space-y-1 mb-2">
            {ips.length === 0 && (
              <p className="text-xs text-red-600">No IPs configured — all check-ins will be blocked in this mode.</p>
            )}
            {ips.map(ip => (
              <div key={ip} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
                <span className="text-sm font-mono flex-1">{ip}</span>
                <button type="button" onClick={() => removeIp(ip)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIp(); } }}
              placeholder="e.g. 203.0.113.10"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addIp}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-gray-400">Enter the public IP of your office network. Check whatismyip.com from your office to find it.</p>
        </div>
      )}

      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the page**

Create `apps/admin/src/app/(portal)/settings/attendance-validation/page.tsx`:

```tsx
'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsAttendanceValidationForm from '@components/forms/SettingsAttendanceValidationForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsAttendanceValidationPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Attendance Validation' }]}>
      <div className="max-w-xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Attendance Check-in Validation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Control how the system verifies that employees are at the office when checking in.
            This is separate from app login — employees can always log in from anywhere.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading
            ? <Skeleton className="h-40 w-full" />
            : <SettingsAttendanceValidationForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 3: Verify page renders (dev server)**

Navigate to `http://localhost:3000/settings/attendance-validation`. Should show the mode selector. No TypeScript errors in console.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/forms/SettingsAttendanceValidationForm.tsx \
        apps/admin/src/app/(portal)/settings/attendance-validation/page.tsx
git commit -m "feat(settings): attendance validation mode UI (geofence vs office IP)"
```

---

## Task 4: Check-in — IP validation + ATT_003

**Files:**
- Modify: `apps/admin/src/app/api/v1/attendance/checkin/route.ts`
- Modify: `apps/admin/src/services/AttendanceService.ts`

**Interfaces:**
- Consumes: `getClientIp(request)` from `@mw/rateLimiter`; `settings.attendanceValidationMode`, `settings.allowedOfficeIps`
- Produces: `ATT_003` error when IP validation fails; `clientIp` forwarded to service

- [ ] **Step 1: Extract and pass clientIp in checkin route**

In `apps/admin/src/app/api/v1/attendance/checkin/route.ts`, add the import at the top:

```typescript
import { getClientIp } from '@mw/rateLimiter';
```

Find the call to `AttendanceService.checkIn(...)` and add `clientIp`:

```typescript
const clientIp = getClientIp(request);
const result = await AttendanceService.checkIn({
  employeeId,
  deviceFingerprintHeader,
  latitude,
  longitude,
  accuracy,
  nonce,
  clientTimestamp,
  clientIp,
});
```

- [ ] **Step 2: Add clientIp to checkIn input type**

In `apps/admin/src/services/AttendanceService.ts`, find the `CheckInInput` interface (or wherever the input type is defined for `checkIn`). Add:

```typescript
  clientIp?: string;
```

- [ ] **Step 3: Add IP validation branch in AttendanceService.checkIn**

Find the geofence check block (around line 192-228). Replace it with the following, keeping ALL existing logic but wrapping with the mode branch:

```typescript
    const validationMode = settings.attendanceValidationMode ?? 'geofence';
    const bypassGeofence = employeeProfile?.allowOutsideGeofence === true;

    let isRemote = false;
    let remoteSource: 'employeeOverride' | 'workAwayApproval' | undefined;
    let remoteApprovalId: mongoose.Types.ObjectId | undefined;

    if (!bypassGeofence) {
      if (validationMode === 'geofence') {
        if (settings.geoFence.isEnabled && !isWithinGeoFence) {
          throw new AppError('ATT_001', 422, 'Outside geofence.');
        }
      } else if (validationMode === 'officeIp') {
        const allowedIps = settings.allowedOfficeIps ?? [];
        if (allowedIps.length > 0 && !allowedIps.includes(input.clientIp ?? '')) {
          throw new AppError('ATT_003', 422, 'Not connected to the approved office network.');
        }
      }
    }

    // Field employees with bypassGeofence flag: mark as remote when outside geofence
    if (!isWithinGeoFence && bypassGeofence) {
      isRemote = true;
      const workAwayReg = await Regularization.findOne({
        employeeId: new mongoose.Types.ObjectId(input.employeeId),
        dateString,
        type: { $in: ['workAwayFromOffice', 'officialTravel', 'clientVisit'] },
        status: 'approved',
      }).lean() as unknown as (IRegularization & { _id: mongoose.Types.ObjectId }) | null;
      if (workAwayReg) {
        remoteSource = 'workAwayApproval';
        remoteApprovalId = workAwayReg._id;
      } else {
        remoteSource = 'employeeOverride';
      }
    }
```

Note: Remove the old block that was exactly lines 192-228 (the old geofence check + remote source detection), replace with the above. The `isWithinGeoFence` variable is still computed above this block from the haversine check.

- [ ] **Step 4: Verify TypeScript**

```powershell
cd apps/admin; npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "validator.ts" | head -20
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/v1/attendance/checkin/route.ts \
        apps/admin/src/services/AttendanceService.ts
git commit -m "feat(attendance): IP validation mode (ATT_003), clientIp forwarding"
```

---

## Task 5: Mobile — handle ATT_003 error

**Files:**
- Modify: `apps/mobile/lib/features/home/presentation/screens/home_screen.dart`

**Interfaces:**
- Consumes: DioException with `error.code === 'ATT_003'`
- Produces: SnackBar with clear "not on office network" message

- [ ] **Step 1: Add ATT_003 handler**

In `home_screen.dart`, find the `catch` block at line ~151 with the ATT_001 handler:

```dart
        if (code == 'ATT_001') {
          _showGpsSheet(_GpsError.outsideGeofence);
          return;
        }
```

After this block, add:

```dart
        if (code == 'ATT_003') {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Check-in failed: you are not connected to the approved office network.'),
              duration: Duration(seconds: 5),
            ),
          );
          return;
        }
```

- [ ] **Step 2: Verify flutter analyze**

```powershell
cd apps/mobile; flutter analyze 2>&1 | head -20
```

Expected: No new issues.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/features/home/presentation/screens/home_screen.dart
git commit -m "fix(mobile): handle ATT_003 office-network check-in rejection"
```

---

## Task 6: Location history admin page

**Files:**
- Create: `apps/admin/src/app/(portal)/attendance/location-history/page.tsx`

**Interfaces:**
- Consumes: GET `/api/v1/attendance/location-snapshots?employeeId=X&dateString=Y&page=1&limit=50`
- Response shape: `{ success: true, data: { snapshots: SnapshotItem[], total: number, page: number } }`

First, read the actual response shape from the existing route:

```powershell
cat apps/admin/src/app/api/v1/attendance/location-snapshots/route.ts
```

Then create the page based on what the API returns.

- [ ] **Step 1: Read location-snapshots route to understand response**

Read `apps/admin/src/app/api/v1/attendance/location-snapshots/route.ts` to confirm the response fields. Expected: `{ data: [{ _id, employeeId: { firstName, lastName, employeeCode }, latitude, longitude, accuracy, capturedAt, address, geocodingStatus, source, dateString }] }` based on `LocationSnapshotService.list()`.

- [ ] **Step 2: Create location history page**

Create `apps/admin/src/app/(portal)/attendance/location-history/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MapPin, Clock, Search } from 'lucide-react';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { TableSkeleton } from '@components/ui/skeleton';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';

interface SnapshotEmployee {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface Snapshot {
  _id: string;
  employeeId: SnapshotEmployee | string;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  address: string | null;
  geocodingStatus: string | null;
  source: string;
  dateString: string;
}

interface Res {
  success: boolean;
  data: Snapshot[];
}

function empName(s: Snapshot) {
  if (typeof s.employeeId === 'object') {
    return `${s.employeeId.firstName} ${s.employeeId.lastName} (${s.employeeId.employeeCode})`;
  }
  return String(s.employeeId);
}

function freshnessLabel(capturedAt: string) {
  const diffMs = Date.now() - new Date(capturedAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return { label: 'Just now', color: 'text-green-600' };
  if (mins < 10) return { label: `${mins}m ago`, color: 'text-green-600' };
  if (mins < 60) return { label: `${mins}m ago`, color: 'text-amber-600' };
  const hrs = Math.floor(mins / 60);
  return { label: `${hrs}h ago`, color: 'text-red-500' };
}

export default function LocationHistoryPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [dateString, setDateString] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [query, setQuery] = useState<{ employeeId: string; dateString: string } | null>(null);

  const params = query
    ? `?dateString=${query.dateString}${query.employeeId ? `&employeeId=${query.employeeId}` : ''}&limit=100`
    : null;

  const { data, isLoading } = useSWR(
    params ? `/api/v1/attendance/location-snapshots${params}` : null,
    (url: string) => apiFetch<Res>(url),
    { refreshInterval: 30000 },
  );

  const snapshots = data?.data ?? [];

  return (
    <AdminLayout breadcrumb={[
      { label: 'Attendance', href: '/attendance' },
      { label: 'Location History' },
    ]}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Field Location History</h1>
          <p className="text-sm text-gray-500 mt-1">GPS snapshots recorded during remote check-in sessions.</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <Input
                type="date"
                value={dateString}
                onChange={e => setDateString(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Employee ID (optional)</label>
              <Input
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="Leave blank for all employees"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setQuery({ employeeId, dateString })}
              disabled={!dateString}
            >
              <Search className="h-4 w-4 mr-1.5" /> Search
            </Button>
          </div>
        </div>

        {/* Results */}
        {!query ? (
          <p className="text-sm text-gray-500 text-center py-8">Select a date and click Search to view snapshots.</p>
        ) : isLoading ? (
          <TableSkeleton />
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No location snapshots found for these filters.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Accuracy</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {snapshots.map(s => {
                  const { label, color } = freshnessLabel(s.capturedAt);
                  return (
                    <tr key={s._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900">{empName(s)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="text-gray-700">{format(parseISO(s.capturedAt), 'HH:mm:ss')}</span>
                        <span className={`ml-1.5 text-xs ${color}`}>{label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                        {s.address
                          ? <span className="flex items-start gap-1"><MapPin className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />{s.address}</span>
                          : <span className="text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3" />
                              {s.geocodingStatus === 'pending' ? 'Geocoding…' : `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`}
                            </span>
                        }
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">±{Math.round(s.accuracy)}m</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {s.source === 'checkin' ? 'Check-in' : 'Periodic'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} — refreshes every 30 seconds
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 3: Verify page renders**

Start dev server (if not running). Navigate to `http://localhost:3000/attendance/location-history`. Should load with filters visible, table empty until Search clicked. No console errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/(portal)/attendance/location-history/page.tsx
git commit -m "feat(attendance): location snapshot history admin page"
```

---

## Task 7: PayrollRecord model — lateMarkCount + halfDayDeduction

**Files:**
- Modify: `apps/admin/src/models/PayrollRecord.ts`

**Interfaces:**
- Produces: `IPayrollRecord` with `lateMarkCount`, `halfDayDeductionDays`, updated `IDeductionBreakdown.halfDayDeduction`

- [ ] **Step 1: Extend IDeductionBreakdown and IPayrollRecord**

In `apps/admin/src/models/PayrollRecord.ts`, extend `IDeductionBreakdown`:

```typescript
export interface IDeductionBreakdown {
  lwpDeduction: number;
  absentDeduction: number;
  halfDayDeduction: number;   // new: deduction from half-day aggregation rule
  manualDeduction: number;
  totalDeductions: number;
}
```

Add to `IPayrollRecord` after `absentDays`:

```typescript
  lateMarkCount: number;
  halfDayDeductionDays: number;
```

In `PayrollRecordSchema`, extend `deductionBreakdown`:

```typescript
    deductionBreakdown: {
      lwpDeduction:     { type: Number, required: true, min: 0 },
      absentDeduction:  { type: Number, required: true, min: 0 },
      halfDayDeduction: { type: Number, default: 0, min: 0 },
      manualDeduction:  { type: Number, default: 0, min: 0 },
      totalDeductions:  { type: Number, required: true, min: 0 },
    },
```

Add to schema after `absentDays` field:

```typescript
    lateMarkCount:       { type: Number, default: 0 },
    halfDayDeductionDays: { type: Number, default: 0 },
```

Also extend the `PayrollRecord` interface in `apps/admin/src/types/api.ts`:

```typescript
  lateMarkCount?: number;
  halfDayDeductionDays?: number;
  deductionBreakdown: {
    lwpDeduction: number;
    absentDeduction: number;
    halfDayDeduction?: number;
    manualDeduction: number;
    totalDeductions: number;
  };
```

- [ ] **Step 2: Verify TypeScript**

```powershell
cd apps/admin; npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "validator.ts" | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/models/PayrollRecord.ts apps/admin/src/types/api.ts
git commit -m "feat(payroll): add lateMarkCount, halfDayDeductionDays, halfDayDeduction to PayrollRecord"
```

---

## Task 8: PayrollEngine — half-day aggregation

**Files:**
- Modify: `apps/admin/src/engines/PayrollEngine.ts`

**Interfaces:**
- Consumes: `PayrollInput` extended with `attendanceHalfDays`, `halfDayAggregationCount`
- Produces: `PayrollResult` extended with `halfDayDeduction`, `halfDayDeductionDays`

- [ ] **Step 1: Extend PayrollInput and PayrollResult**

In `apps/admin/src/engines/PayrollEngine.ts`, extend the interfaces:

```typescript
export interface PayrollInput {
  grossSalary: number;
  effectiveWorkingDays: number;
  effectiveLwpDays: number;
  absentDays: number;
  manualDeduction: number;
  attendanceHalfDays: number;      // non-LWP half-days from attendance
  halfDayAggregationCount: number; // 0 = disabled; N>=2 = N half-days → 1 deduction day
}

export interface PayrollResult {
  perDaySalary: number;
  lwpDeduction: number;
  absentDeduction: number;
  halfDayDeduction: number;
  halfDayDeductionDays: number;
  attendanceDeduction: number;
  totalDeductions: number;
  netSalary: number;
}
```

- [ ] **Step 2: Update computePayroll**

Replace `computePayroll` with:

```typescript
export function computePayroll(input: PayrollInput): PayrollResult {
  if (input.effectiveWorkingDays === 0) {
    return {
      perDaySalary: 0, lwpDeduction: 0, absentDeduction: 0,
      halfDayDeduction: 0, halfDayDeductionDays: 0,
      attendanceDeduction: 0, totalDeductions: 0, netSalary: 0,
    };
  }

  const perDaySalary = input.grossSalary / input.effectiveWorkingDays;

  // Half-day aggregation: N half-days = 1 deduction day; surplus = 0.5 each
  let halfDayDeductionDays = 0;
  const agg = input.halfDayAggregationCount;
  if (agg >= 2 && input.attendanceHalfDays > 0) {
    const groups = Math.floor(input.attendanceHalfDays / agg);
    const surplus = input.attendanceHalfDays % agg;
    halfDayDeductionDays = groups + surplus * 0.5;
  }
  // When aggregation disabled: no deduction from half-days (existing behaviour — half-days
  // reduce present count but don't directly deduct unless configured)

  const halfDayDeduction = Math.round(halfDayDeductionDays * perDaySalary * 100) / 100;
  const lwpDeduction = Math.round(input.effectiveLwpDays * perDaySalary * 100) / 100;
  const absentDeduction = Math.round(input.absentDays * perDaySalary * 100) / 100;
  const attendanceDeduction = lwpDeduction + absentDeduction + halfDayDeduction;
  const totalDeductions = attendanceDeduction + input.manualDeduction;
  const netSalary = Math.round(Math.max(0, input.grossSalary - totalDeductions) * 100) / 100;

  return {
    perDaySalary, lwpDeduction, absentDeduction,
    halfDayDeduction, halfDayDeductionDays,
    attendanceDeduction, totalDeductions, netSalary,
  };
}
```

- [ ] **Step 3: Verify TypeScript**

```powershell
cd apps/admin; npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "validator.ts" | head -20
```

Expected: zero errors (PayrollService will show errors until Task 9).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/engines/PayrollEngine.ts
git commit -m "feat(payroll): PayrollEngine half-day aggregation (N half-days = 1 deduction day)"
```

---

## Task 9: PayrollService — wire lateMarkCount + halfDayAggregation

**Files:**
- Modify: `apps/admin/src/services/PayrollService.ts`

**Interfaces:**
- Consumes: `computePayroll` with new fields from Task 8; `settings.payrollRules`; `AttendanceDay.isLateArrival`
- Produces: `lateMarkCount`, `halfDayDeductionDays`, `halfDayDeduction` stored in PayrollRecord

- [ ] **Step 1: Count lateMarkCount and attendanceHalfDays in aggregation loop**

Find the aggregation loop (lines ~158-173):

```typescript
let presentFull = 0, halfDays = 0, halfDayLwpDays = 0, lwpFull = 0, paidLeaveDays = 0, absentDays = 0;
for (const day of attendanceDays as Array<{ status: string; leaveType?: string }>) {
```

Change to:

```typescript
let presentFull = 0, halfDays = 0, halfDayLwpDays = 0, lwpFull = 0, paidLeaveDays = 0, absentDays = 0, lateMarkCount = 0;
for (const day of attendanceDays as Array<{ status: string; leaveType?: string; isLateArrival?: boolean }>) {
  if (day.isLateArrival) lateMarkCount++;
  switch (day.status) {
```

(Keep the switch body unchanged — only add the `lateMarkCount++` line and update the type cast.)

- [ ] **Step 2: Compute attendanceHalfDays and pass payrollRules to engine**

After the aggregation loop, find:

```typescript
const effectiveLwpDays     = lwpFull + halfDayLwpDays * 0.5;
const effectivePresentDays = presentFull + halfDays * 0.5;
const manualDeduction      = existing?.manualDeduction ?? 0;
```

Change to:

```typescript
const attendanceHalfDays    = halfDays - halfDayLwpDays; // non-LWP half-days only
const effectiveLwpDays      = lwpFull + halfDayLwpDays * 0.5;
const effectivePresentDays  = presentFull + halfDays * 0.5;
const manualDeduction       = existing?.manualDeduction ?? 0;
const manualDeductionRemark = existing?.manualDeductionRemark ?? '';
const halfDayAggregationCount = settings.payrollRules?.halfDayAggregationCount ?? 0;
```

- [ ] **Step 3: Pass new fields to computePayroll**

Find the `computePayroll({...})` call and add the two new fields:

```typescript
const engineResult = computePayroll({
  grossSalary:             employee.monthlySalary,
  effectiveWorkingDays,
  effectiveLwpDays,
  absentDays,
  manualDeduction,
  attendanceHalfDays,
  halfDayAggregationCount,
});
```

- [ ] **Step 4: Store new fields in PayrollRecord**

In the `$set` object inside `findOneAndUpdate`, add after `absentDays`:

```typescript
            lateMarkCount:        lateMarkCount,
            halfDayDeductionDays: engineResult.halfDayDeductionDays,
```

And extend `deductionBreakdown`:

```typescript
            deductionBreakdown: {
              lwpDeduction:    engineResult.lwpDeduction,
              absentDeduction: engineResult.absentDeduction,
              halfDayDeduction: engineResult.halfDayDeduction,
              manualDeduction,
              totalDeductions: engineResult.totalDeductions,
            },
```

- [ ] **Step 5: Verify TypeScript**

```powershell
cd apps/admin; npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "validator.ts" | head -20
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/services/PayrollService.ts
git commit -m "feat(payroll): wire lateMarkCount, halfDayAggregation into PayrollService"
```

---

## Task 10: Payroll detail page — calculation breakdown section

**Files:**
- Modify: `apps/admin/src/app/(portal)/payroll/[yearMonth]/[id]/page.tsx`

**Interfaces:**
- Consumes: `PayrollRecord` with `lateMarkCount`, `halfDayDeductionDays`, `deductionBreakdown.halfDayDeduction`

- [ ] **Step 1: Add calculation breakdown section**

In the payroll detail page, after the existing "Salary Breakdown" section (around line 152-172, ends with the Net Salary row) and before the "Manual Deduction" section, insert a new "Deduction Breakdown" block:

```tsx
              {/* Deduction breakdown */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">Deduction Breakdown</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Per-Day Rate</span>
                    <span>{fmtCurrency(r.perDaySalary)}</span>
                  </div>
                  {r.effectiveLwpDays > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>LWP ({r.effectiveLwpDays} day{r.effectiveLwpDays !== 1 ? 's' : ''})</span>
                      <span className="text-red-600">−{fmtCurrency(r.deductionBreakdown.lwpDeduction)}</span>
                    </div>
                  )}
                  {r.absentDays > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Absent ({r.absentDays} day{r.absentDays !== 1 ? 's' : ''})</span>
                      <span className="text-red-600">−{fmtCurrency(r.deductionBreakdown.absentDeduction)}</span>
                    </div>
                  )}
                  {(r.halfDayDeductionDays ?? 0) > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>
                        Half-day attendance ({r.halfDays} half-day{r.halfDays !== 1 ? 's' : ''}
                        {' '}→{' '}{r.halfDayDeductionDays} deduction day{r.halfDayDeductionDays !== 1 ? 's' : ''})
                      </span>
                      <span className="text-red-600">−{fmtCurrency(r.deductionBreakdown.halfDayDeduction ?? 0)}</span>
                    </div>
                  )}
                  {(r.lateMarkCount ?? 0) > 0 && (
                    <div className="flex justify-between text-gray-400 text-xs">
                      <span>Late arrivals (informational)</span>
                      <span>{r.lateMarkCount} day{(r.lateMarkCount ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {r.manualDeduction > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Manual deduction</span>
                      <span className="text-red-600">−{fmtCurrency(r.manualDeduction)}</span>
                    </div>
                  )}
                </div>
              </div>
```

- [ ] **Step 2: Verify page renders in browser**

Navigate to any existing payroll record detail page. Deduction Breakdown section should appear. If halfDayAggregation is 0, the half-day row won't show (correct). Late arrivals shows as informational if any.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/(portal)/payroll/[yearMonth]/[id]/page.tsx
git commit -m "feat(payroll): deduction breakdown section on payslip detail page"
```

---

## Task 11: Payroll Rules settings page

**Files:**
- Create: `apps/admin/src/components/forms/SettingsPayrollRulesForm.tsx`
- Create: `apps/admin/src/app/(portal)/settings/payroll-rules/page.tsx`

**Interfaces:**
- Consumes: `Settings.payrollRules.halfDayAggregationCount`
- Produces: PATCH `/api/v1/settings` with `payrollRules` body

- [ ] **Step 1: Create form component**

Create `apps/admin/src/components/forms/SettingsPayrollRulesForm.tsx`:

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

const schema = z.object({
  halfDayAggregationCount: z.coerce.number().int().min(0).max(31),
});
type Form = z.infer<typeof schema>;

interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsPayrollRulesForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { halfDayAggregationCount: settings?.payrollRules?.halfDayAggregationCount ?? 0 },
  });

  useEffect(() => {
    if (settings?.payrollRules !== undefined) {
      reset({ halfDayAggregationCount: settings.payrollRules.halfDayAggregationCount });
    }
  }, [settings, reset]);

  const count = watch('halfDayAggregationCount');

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ payrollRules: data }),
      });
      toast.success('Payroll rules updated');
      onSuccess?.();
    } catch { toast.error('Failed to update payroll rules'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Half-day aggregation (days)
        </label>
        <Input
          type="number"
          min={0}
          max={31}
          step={1}
          error={!!errors.halfDayAggregationCount}
          {...register('halfDayAggregationCount')}
        />
        {errors.halfDayAggregationCount && (
          <p className="mt-1 text-xs text-red-600">{errors.halfDayAggregationCount.message}</p>
        )}
        <p className="mt-1.5 text-xs text-gray-500">
          {count === 0
            ? 'Disabled — half-day attendance marks have no direct payroll deduction.'
            : `${count} half-day attendance marks = 1 deduction day. Remaining marks count as 0.5 days each.`
          }
        </p>
        <p className="mt-1 text-xs text-amber-600">
          Re-compute all draft payroll records after changing this setting.
        </p>
      </div>
      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
```

- [ ] **Step 2: Create page**

Create `apps/admin/src/app/(portal)/settings/payroll-rules/page.tsx`:

```tsx
'use client';
import AdminLayout from '@components/layout/AdminLayout';
import SettingsPayrollRulesForm from '@components/forms/SettingsPayrollRulesForm';
import { useSettings } from '@/hooks/useSettings';
import { Skeleton } from '@components/ui/skeleton';

export default function SettingsPayrollRulesPage() {
  const { settings, isLoading, refresh } = useSettings();
  return (
    <AdminLayout breadcrumb={[{ label: 'Settings', href: '/settings' }, { label: 'Payroll Rules' }]}>
      <div className="max-w-xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payroll Rules</h1>
          <p className="text-sm text-gray-500 mt-1">Configure how attendance affects salary deductions.</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoading ? <Skeleton className="h-24 w-full" /> : <SettingsPayrollRulesForm settings={settings} onSuccess={refresh} />}
        </div>
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 3: Verify page renders**

Navigate to `http://localhost:3000/settings/payroll-rules`. Should show the form with halfDayAggregationCount field.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/forms/SettingsPayrollRulesForm.tsx \
        apps/admin/src/app/(portal)/settings/payroll-rules/page.tsx
git commit -m "feat(settings): payroll rules settings page (half-day aggregation)"
```

---

## Task 12: Static checks + APK build

**Files:** No changes — verification only.

- [ ] **Step 1: TypeScript full check**

```powershell
cd apps/admin; npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "validator.ts"
```

Expected: zero errors (validator.ts lines are pre-existing generated file — safe to ignore).

- [ ] **Step 2: Next.js production build**

```powershell
cd apps/admin; npx next build 2>&1 | tail -20
```

Expected: `Route (app)` table printed, `✓ Compiled successfully` or similar, zero errors. The validator.ts error disappears after build (it regenerates clean).

- [ ] **Step 3: Flutter analyze**

```powershell
cd apps/mobile; flutter analyze 2>&1 | tail -10
```

Expected: `No issues found!`

- [ ] **Step 4: APK build**

```powershell
cd apps/mobile; flutter build apk --debug 2>&1 | tail -5
```

Expected: `Built build/app/outputs/flutter-apk/app-debug.apk`

- [ ] **Step 5: If any errors, fix and re-run**

Common issues:
- `Property 'halfDayDeduction' does not exist on type 'IDeductionBreakdown'` — update the schema type to add the field
- `Expected N arguments, but got M` on `computePayroll` — ensure PayrollService passes all new fields
- Flutter: dart null check — ensure ATT_003 handler returns before the generic snackbar

- [ ] **Step 6: Commit fixes if any**

```bash
git add -p  # stage only relevant files
git commit -m "fix(phase-28): static check fixes"
```

---

## Task 13: Commit + push

- [ ] **Step 1: Final git status check**

```bash
git status
git log --oneline -10
```

- [ ] **Step 2: Push**

```bash
git push origin master
```

Expected: push succeeds, no force required.

---

## Self-Review Checklist

### Spec coverage

| Requirement | Task | Status |
|---|---|---|
| `attendanceValidationMode: geofence\|officeIp` setting | 1, 2, 3 | ✓ |
| `allowedOfficeIps` IP list | 1, 2, 3 | ✓ |
| `allowOutsideGeofence` employees bypass both modes | 4 | ✓ |
| `ATT_003` error for IP failure | 4 | ✓ |
| Admin settings UI for validation mode + IP list | 3 | ✓ |
| Mobile ATT_003 error handling | 5 | ✓ |
| Location history admin page | 6 | ✓ |
| `halfDayAggregationCount` payroll rule | 1, 2, 7, 8, 9, 11 | ✓ |
| `lateMarkCount` stored per payroll record | 7, 9 | ✓ |
| Payroll breakdown UI | 10 | ✓ |
| Payroll rules settings page | 11 | ✓ |
| Static checks pass | 12 | ✓ |

### Type consistency

- `halfDayAggregationCount` used in: CompanySettings model, SettingsService, settings route, PayrollEngine input, PayrollService — all consistent
- `halfDayDeduction` used in: IDeductionBreakdown, PayrollRecord schema, PayrollEngine output, PayrollService $set, payroll detail page — all consistent
- `ATT_003` used in: AttendanceService (throws), home_screen.dart (catches) — consistent
- `attendanceValidationMode` used in: CompanySettings model/schema, SettingsService, settings route toShape, Settings type, SettingsAttendanceValidationForm — consistent
