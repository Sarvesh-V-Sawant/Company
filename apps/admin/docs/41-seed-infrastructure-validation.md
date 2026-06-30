# Phase 15.18 — Seed Infrastructure Validation

**Date:** 2026-06-28  
**Phase:** 15.18 (Seed Infrastructure Stabilization)  
**Status:** COMPLETE

## Root Cause

`scripts/seed-admin.ts` called `process.env.MONGODB_URI` without loading the project's environment file. When run via `npx tsx scripts/seed-admin.ts` (or `npm run seed:admin`), the shell does not source `.env.local` — only Next.js dev/build does this automatically. Result: `Error: MONGODB_URI is not defined`.

## Environment Loading Strategy

Created `scripts/bootstrap-env.ts` — a shared, zero-dependency env loader:

- Reads `.env` first (base), then `.env.local` (overrides) — matching Next.js load order
- Skips missing files silently (production: env vars already injected by Vercel/CI)
- Does **not** override already-set variables (shell exports take priority)
- Handles both quoted and unquoted values
- Skips blank lines and `#`-comment lines

Every seed script imports it as the **first** import:
```ts
import './bootstrap-env';  // must be first — sets process.env before any DB calls
```

## Seed Scripts Reviewed

| Script | Before | After |
|--------|--------|-------|
| `scripts/seed-admin.ts` | No env loading → runtime crash | `bootstrap-env` added as first import |
| `scripts/seed-settings.ts` | Stub — `throw new Error('Not implemented')` | Full production-grade implementation |
| `scripts/migrations/runner.ts` | No env loading | `bootstrap-env` added as first import |
| `scripts/bootstrap-env.ts` | Did not exist | Created — shared env loader |

## Files Modified

| File | Change |
|------|--------|
| `scripts/bootstrap-env.ts` | **Created** — shared env loader |
| `scripts/seed-admin.ts` | Added `import './bootstrap-env'` as first import |
| `scripts/seed-settings.ts` | **Full rewrite** — production seed implementation |
| `scripts/migrations/runner.ts` | Added `import '../bootstrap-env'` as first import |
| `package.json` | Fixed `seed:all` order: admin → settings (holidays require admin ObjectId) |

## Validation Results

### seed-admin (fresh DB)
```
[seed-admin] Connected to MongoDB
[seed-admin] Admin created: admin@genesis.com
[seed-admin] Password: Admin@123456
```

### seed-settings (after seed-admin)
```
[seed-settings] Connected to MongoDB
[seed-settings] CompanySettings created: Genesis Workforce
[seed-settings] 5 holidays seeded for 2026
[seed-settings] Holiday list:
  2026-01-26  Republic Day (national)
  2026-08-15  Independence Day (national)
  2026-10-02  Gandhi Jayanti (national)
  2026-01-01  New Year's Day (company)
  2026-12-25  Christmas Day (company)
[seed-settings] Done
```

### Idempotency (re-run)
```
[seed-admin] Admin already exists: admin@genesis.com
[seed-settings] CompanySettings already exists — skipping settings seed
[seed-settings] 5 holidays already exist for 2026 — skipping
```

### Quality Gates
| Gate | Result |
|------|--------|
| `tsc --noEmit` | exit 0 ✓ |
| `eslint src --max-warnings 0` | exit 0 ✓ |
| `jest` | 286/286 ✓ |

## Seeded Collections

### `companysettings` (singleton `_id: 'company-settings'`)

| Category | Field | Value |
|----------|-------|-------|
| Company | `companyName` | `SEED_COMPANY_NAME` env or `'Genesis Workforce'` |
| Company | `timezone` | `Asia/Kolkata` |
| Company | `currency` | `INR` |
| Shift | `workStartTime` | `09:00` |
| Shift | `workEndTime` | `18:00` |
| Shift | `halfDayLateCheckInTime` | `14:00` |
| Shift | `requiredDailyMinutes` | `480` (8 h) |
| Shift | `halfDayThresholdMinutes` | `240` (4 h) |
| Shift | `sessionAutoClosePaddingMinutes` | `30` |
| Attendance | `lateArrivalGraceMinutes` | `15` |
| Attendance | `regularizationLookbackDays` | `7` |
| Attendance | `gpsAccuracyThresholdMeters` | `50` |
| Attendance | `checkinTimestampWindowMinutes` | `5` |
| Working days | `workingDays` | Mon–Fri |
| Geofence | `latitude` | `SEED_GEOFENCE_LATITUDE` or `19.0760` (Mumbai) |
| Geofence | `longitude` | `SEED_GEOFENCE_LONGITUDE` or `72.8777` (Mumbai) |
| Geofence | `radiusMeters` | `SEED_GEOFENCE_RADIUS_METERS` or `200` |
| Geofence | `isEnabled` | `SEED_GEOFENCE_ENABLED` or `true` |
| Leave | `leaveYearStartMonth` | `1` (January) |
| Leave | `paidLeave.annualAllocation` | `12` |
| Leave | `paidLeave.carryForward` | enabled, max 15 days, expires in 3 months |
| Leave | `sickLeave.annualAllocation` | `12` |
| Leave | `casualLeave.annualAllocation` | `6` |
| Payroll | `payrollCutoffDay` | `25` |
| Notifications | `attendanceReminderEnabled` | `true` |
| Notifications | `attendanceReminderTime` | `10:30` |

### `holidays` (current year — national + company)

| Date | Name | Type |
|------|------|------|
| Jan 26 | Republic Day | national |
| Aug 15 | Independence Day | national |
| Oct 2 | Gandhi Jayanti | national |
| Jan 1 | New Year's Day | company |
| Dec 25 | Christmas Day | company |

## Environment Variables for Seed Customization

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEED_COMPANY_NAME` | `Genesis Workforce` | Company display name |
| `SEED_ADMIN_EMAIL` | `admin@genesis.com` | Admin login email |
| `SEED_ADMIN_PASSWORD` | `Admin@123456` | Admin initial password |
| `SEED_ADMIN_EMPLOYEE_ID` | `EMP001` | Admin employee ID |
| `SEED_GEOFENCE_LATITUDE` | `19.0760` | Office latitude |
| `SEED_GEOFENCE_LONGITUDE` | `72.8777` | Office longitude |
| `SEED_GEOFENCE_RADIUS_METERS` | `200` | Geofence radius |
| `SEED_GEOFENCE_ENABLED` | `true` | Enable geofence on seed |

## Production Readiness

**Required before Go-Live:**
1. Set real office coordinates via `SEED_GEOFENCE_LATITUDE` / `SEED_GEOFENCE_LONGITUDE` (default is Mumbai)
2. Set `SEED_COMPANY_NAME` to the actual company name
3. Run `npm run seed:all` once against the production database
4. Add Indian regional holidays for the current year via the admin UI (`/settings/holidays`)
5. Delete or rotate `SEED_ADMIN_PASSWORD` from environment variables after seeding

**Decision Rule satisfied:** All seed scripts now load `.env.local` automatically — no manual `export` required on fresh database setup.
