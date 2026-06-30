# 08 — Project Scaffolding Specification
**Workforce Management Platform**
Baseline: All design specifications approved (docs/01–07)
Date: 2026-06-15
Status: **v1.1 — Pending final approval — do not scaffold yet**
Remediation: `docs/08.2-scaffolding-remediation.md` (4 HIGH findings resolved)

---

## 0. Scaffold Philosophy

- Scaffold = folder structure + config files + stub files + tooling. No business logic.
- Every stub file exports its type signature only; body is `throw new Error('Not implemented')`.
- All 6 cron routes exist from day one and return `{ success: true }` immediately.
- Read `node_modules/next/dist/docs/` before writing any Next.js config or API code (per AGENTS.md).
- `packages/types` is a shared npm workspace package imported by `apps/admin` as `@company/types`.

---

## 1. Repository Structure

### 1.1 Root Layout

```
/ (workspace root)
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── mobile-ci.yml
│   │   └── mobile-release.yml
│   └── pull_request_template.md
├── apps/
│   ├── admin/                      ← Next.js 16.2.9 (API + admin portal)
│   └── mobile/                     ← Flutter 3.x (Android employee app)
├── packages/
│   └── types/                      ← Shared TypeScript API contracts
├── docs/
├── .gitignore
├── .npmrc                          ← workspaces hoisting config
└── package.json                    ← npm workspaces root
```

### 1.2 `apps/admin/` — Complete Tree

```
apps/admin/
├── src/
│   ├── middleware.ts                                     ← Next.js route middleware (MUST be in src/ — src/ is source root)
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── auth/
│   │   │       │   ├── login/route.ts
│   │   │       │   ├── logout/route.ts
│   │   │       │   ├── refresh/route.ts
│   │   │       │   ├── forgot-password/route.ts
│   │   │       │   ├── reset-password/route.ts
│   │   │       │   └── me/
│   │   │       │       ├── route.ts                  ← GET /me + PATCH /me
│   │   │       │       ├── password/route.ts         ← PATCH /me/password
│   │   │       │       └── fcm-token/route.ts        ← PATCH /me/fcm-token (G-002)
│   │   │       ├── employees/
│   │   │       │   ├── route.ts                      ← GET list + POST create
│   │   │       │   └── [id]/route.ts                 ← GET + PATCH + DELETE
│   │   │       ├── attendance/
│   │   │       │   ├── checkin/route.ts
│   │   │       │   ├── checkout/route.ts
│   │   │       │   ├── today/route.ts                ← G-003 response shape
│   │   │       │   └── [employeeId]/
│   │   │       │       ├── route.ts                  ← GET history
│   │   │       │       └── correction/route.ts
│   │   │       ├── leaves/
│   │   │       │   ├── route.ts                      ← GET list + POST apply
│   │   │       │   ├── balance/route.ts
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts
│   │   │       │       ├── approve/route.ts
│   │   │       │       ├── reject/route.ts
│   │   │       │       └── cancel/route.ts           ← G-008 PATCH status
│   │   │       ├── regularizations/
│   │   │       │   ├── route.ts
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts
│   │   │       │       ├── approve/route.ts
│   │   │       │       ├── reject/route.ts
│   │   │       │       └── withdraw/route.ts         ← G-008 PATCH status
│   │   │       ├── payroll/
│   │   │       │   ├── route.ts                      ← GET list
│   │   │       │   ├── compute/route.ts              ← POST
│   │   │       │   ├── lock/route.ts                 ← DELETE admin unlock
│   │   │       │   └── [employeeId]/[month]/[year]/route.ts
│   │   │       ├── notifications/
│   │   │       │   ├── route.ts
│   │   │       │   ├── read-all/route.ts
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts
│   │   │       │       └── read/route.ts
│   │   │       ├── settings/
│   │   │       │   ├── company/route.ts
│   │   │       │   ├── holidays/
│   │   │       │   │   ├── route.ts
│   │   │       │   │   └── [id]/route.ts
│   │   │       │   ├── leave-types/
│   │   │       │   │   ├── route.ts
│   │   │       │   │   └── [code]/route.ts
│   │   │       │   ├── geofence/route.ts
│   │   │       │   ├── shift/route.ts
│   │   │       │   └── working-days/route.ts
│   │   │       └── reports/
│   │   │           ├── attendance/route.ts
│   │   │           ├── leave/route.ts
│   │   │           └── payroll/route.ts
│   │   ├── cron/
│   │   │   ├── session-auto-close/route.ts
│   │   │   ├── leave-year-allocation/route.ts
│   │   │   ├── leave-carryforward-expiry/route.ts
│   │   │   ├── attendance-reminder/route.ts
│   │   │   ├── checkout-reminder/route.ts
│   │   │   └── payroll-month-end/route.ts
│   │   ├── admin/
│   │   │   └── cron/
│   │   │       ├── session-auto-close/route.ts       ← POST manual trigger
│   │   │       ├── leave-year-allocation/route.ts    ← POST ?force=true
│   │   │       └── leave-carryforward-expiry/route.ts
│   │   ├── health/route.ts
│   │   ├── (portal)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── employees/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── attendance/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [employeeId]/page.tsx
│   │   │   ├── leaves/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── regularizations/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── payroll/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [month]/[year]/page.tsx
│   │   │   ├── notifications/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx                          ← redirect → /settings/company
│   │   │   │   ├── company/page.tsx
│   │   │   │   ├── holidays/page.tsx
│   │   │   │   ├── leave-types/page.tsx
│   │   │   │   ├── geofence/page.tsx
│   │   │   │   ├── shift/page.tsx
│   │   │   │   └── working-days/page.tsx
│   │   │   └── audit-logs/page.tsx
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── change-password/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   ├── layout.tsx                                ← root layout; fonts + providers
│   │   ├── page.tsx                                  ← redirect → /dashboard or /login
│   │   ├── not-found.tsx
│   │   └── error.tsx
│   ├── components/
│   │   ├── ui/                                       ← shadcn/ui CLI output (auto-generated)
│   │   ├── layout/
│   │   │   ├── AdminLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Breadcrumb.tsx
│   │   │   └── SessionExpiredOverlay.tsx
│   │   ├── tables/
│   │   │   ├── EmployeeTable.tsx
│   │   │   ├── AttendanceTable.tsx
│   │   │   ├── LeaveTable.tsx
│   │   │   ├── RegularizationTable.tsx
│   │   │   ├── PayrollTable.tsx
│   │   │   ├── NotificationTable.tsx
│   │   │   └── AuditLogTable.tsx
│   │   ├── forms/
│   │   │   ├── EmployeeForm.tsx
│   │   │   ├── AttendanceCorrectionForm.tsx
│   │   │   ├── LeaveApprovalForm.tsx
│   │   │   ├── RegularizationApprovalForm.tsx
│   │   │   ├── SettingsCompanyForm.tsx
│   │   │   ├── SettingsHolidayForm.tsx
│   │   │   ├── SettingsLeaveTypeForm.tsx
│   │   │   ├── SettingsGeofenceForm.tsx
│   │   │   ├── SettingsShiftForm.tsx
│   │   │   └── SettingsWorkingDaysForm.tsx
│   │   ├── modals/
│   │   │   ├── ConfirmModal.tsx
│   │   │   ├── PayrollReopenModal.tsx
│   │   │   ├── LeaveDetailModal.tsx
│   │   │   └── RegularizationDetailModal.tsx
│   │   ├── charts/
│   │   │   ├── AttendanceChart.tsx
│   │   │   └── LeaveChart.tsx
│   │   └── shared/
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── EmptyState.tsx
│   │       ├── Pagination.tsx
│   │       ├── StatusBadge.tsx
│   │       ├── PayrollStaleBanner.tsx
│   │       └── MaintenanceBanner.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useEmployees.ts
│   │   ├── useAttendance.ts
│   │   ├── useLeaves.ts
│   │   ├── useRegularizations.ts
│   │   ├── usePayroll.ts
│   │   ├── useNotifications.ts
│   │   ├── useSettings.ts
│   │   └── usePagination.ts
│   ├── lib/
│   │   ├── db/
│   │   │   ├── connect.ts                            ← Mongoose connect + retry
│   │   │   └── index.ts                              ← re-export
│   │   ├── redis/
│   │   │   ├── client.ts                             ← Upstash REST client
│   │   │   ├── rate-limiter.ts
│   │   │   └── idempotency.ts
│   │   ├── firebase/
│   │   │   ├── admin.ts                              ← Firebase Admin SDK init
│   │   │   └── fcm.ts                                ← send helper
│   │   ├── email/
│   │   │   ├── brevo.ts                              ← REST client (no SDK)
│   │   │   └── templates/
│   │   │       ├── index.ts                          ← template registry + render fn
│   │   │       ├── welcome.html
│   │   │       ├── leave-approved.html
│   │   │       ├── leave-rejected.html
│   │   │       ├── payroll-reminder.html
│   │   │       └── password-reset.html
│   │   └── utils/
│   │       ├── date-ist.ts                           ← getCurrentDateIST, getCurrentMonthIST, etc.
│   │       ├── pagination.ts
│   │       ├── api-response.ts                       ← success() / error() response builders
│   │       ├── cron-guard.ts                         ← validates Authorization: Bearer CRON_SECRET
│   │       └── hash.ts                               ← SHA-256 (password reset token)
│   ├── models/
│   │   ├── index.ts                                  ← re-exports all models
│   │   ├── User.ts
│   │   ├── Employee.ts
│   │   ├── CompanySettings.ts
│   │   ├── AttendanceRecord.ts                       ← sessions[] embedded subdoc
│   │   ├── Leave.ts
│   │   ├── LeaveYearAllocation.ts
│   │   ├── LeaveTransaction.ts
│   │   ├── Regularization.ts
│   │   ├── PayrollRecord.ts                          ← staleEmployeeIds: [String]
│   │   ├── Notification.ts
│   │   ├── AuditLog.ts
│   │   └── SystemEvent.ts
│   ├── repositories/
│   │   ├── UserRepository.ts
│   │   ├── EmployeeRepository.ts
│   │   ├── SettingsRepository.ts
│   │   ├── AttendanceRepository.ts
│   │   ├── LeaveRepository.ts
│   │   ├── LeaveYearAllocationRepository.ts
│   │   ├── RegularizationRepository.ts
│   │   ├── PayrollRepository.ts
│   │   ├── NotificationRepository.ts
│   │   ├── AuditLogRepository.ts
│   │   └── SystemEventRepository.ts
│   ├── services/
│   │   ├── AuthService.ts
│   │   ├── EmployeeService.ts
│   │   ├── SettingsService.ts
│   │   ├── AttendanceService.ts
│   │   ├── DayStatusService.ts
│   │   ├── LeaveService.ts
│   │   ├── LeaveBalanceService.ts
│   │   ├── RegularizationService.ts
│   │   ├── PayrollService.ts
│   │   ├── PayrollLockService.ts
│   │   ├── NotificationService.ts
│   │   ├── FcmService.ts
│   │   ├── EmailService.ts
│   │   ├── AuditService.ts
│   │   └── ReportService.ts
│   ├── engines/
│   │   ├── DayStatusEngine.ts                        ← pure fn, no I/O
│   │   ├── PayrollEngine.ts                          ← pure fn, no I/O
│   │   └── GeoFenceEngine.ts                         ← pure fn, no I/O
│   ├── validators/
│   │   ├── auth.ts
│   │   ├── employee.ts
│   │   ├── attendance.ts
│   │   ├── leave.ts
│   │   ├── regularization.ts
│   │   ├── payroll.ts
│   │   └── settings.ts
│   ├── middleware/
│   │   ├── requireAuth.ts                            ← JWT verify; returns decoded payload
│   │   ├── requireRole.ts                            ← checks payload.role
│   │   ├── rateLimiter.ts                            ← Upstash ratelimit wrapper
│   │   ├── idempotency.ts                            ← X-Idempotency-Key Redis check (G-004)
│   │   ├── auditMiddleware.ts                        ← AuditLog write on admin mutations
│   │   ├── csrfMiddleware.ts
│   │   └── cronGuard.ts                              ← validates CRON_SECRET header
│   ├── types/
│   │   ├── api.ts                                    ← ApiResponse<T>, PaginatedResponse<T>
│   │   ├── jwt.ts                                    ← JwtPayload interface
│   │   ├── enums.ts                                  ← DayStatus, LeaveStatus, PayrollStatus, etc.
│   │   └── contracts.ts                              ← Cross-phase contracts A–D interfaces
│   └── constants/
│       ├── errors.ts                                 ← AUTH_001…AUTH_011, ATT_001…, etc.
│       ├── roles.ts
│       ├── leave-types.ts
│       └── cron-names.ts
├── scripts/
│   ├── seed-admin.ts
│   ├── seed-settings.ts
│   └── migrations/
│       └── .gitkeep
├── __tests__/
│   ├── unit/
│   │   ├── services/
│   │   ├── engines/
│   │   ├── validators/
│   │   └── utils/
│   ├── integration/
│   │   ├── auth/
│   │   ├── attendance/
│   │   ├── leave/
│   │   ├── regularization/
│   │   └── payroll/
│   ├── fixtures/
│   │   ├── users.ts
│   │   ├── employees.ts
│   │   ├── settings.ts
│   │   └── attendance.ts
│   └── helpers/
│       ├── db.ts                                     ← mongodb-memory-server setup/teardown
│       └── request.ts                                ← supertest factory
├── public/
│   └── favicon.ico
├── instrumentation.ts                                ← Mongoose init via register() export (project root — NOT src/)
├── postcss.config.mjs                                ← Tailwind v4: { '@tailwindcss/postcss': {} }
├── vercel.ts                                         ← VercelConfig + 6 cron definitions
├── next.config.ts                                    ← serverExternalPackages: ['mongoose']; read docs first
├── tsconfig.json
├── package.json
├── eslint.config.mjs
├── .prettierrc
├── jest.config.ts
└── jest.setup.ts
```

> **File placement rules:**
> - `src/middleware.ts` — Next.js **route middleware** (guard chain). Runs at network level before any route handler. Never import from `src/middleware/` here — limited runtime.
> - `src/middleware/` — API-route **helper functions** (`requireAuth.ts`, `requireRole.ts`, etc.). Called from inside route handlers.
> - `instrumentation.ts` — at **project root** (not `src/`). Always at root regardless of `src/` presence.
> - Verify `src/middleware.ts` placement against `node_modules/next/dist/docs/` for Next.js 16.2.9 before creating.

### 1.3 `apps/mobile/` — Complete Tree

```
apps/mobile/
├── android/
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml                  ← see Section 9.1 for required permissions
│   │   │   └── res/
│   │   │       └── values/
│   │   │           └── strings.xml
│   │   ├── google-services.json                     ← Firebase (gitignored; per-env)
│   │   └── build.gradle
│   ├── build.gradle
│   ├── gradle.properties
│   └── key.properties                               ← signing config (gitignored)
├── lib/
│   ├── main.dart
│   ├── app.dart                                     ← ProviderScope + GoRouter
│   ├── core/
│   │   ├── constants/
│   │   │   ├── api_endpoints.dart
│   │   │   ├── app_constants.dart
│   │   │   └── storage_keys.dart
│   │   ├── di/
│   │   │   └── providers.dart                       ← all Riverpod provider declarations
│   │   ├── error/
│   │   │   ├── exceptions.dart
│   │   │   └── failures.dart
│   │   ├── network/
│   │   │   ├── api_client.dart                      ← Dio instance + base URL
│   │   │   └── interceptors/
│   │   │       ├── auth_interceptor.dart            ← JWT attach + 401 refresh
│   │   │       ├── idempotency_interceptor.dart     ← X-Idempotency-Key (G-004)
│   │   │       └── logging_interceptor.dart
│   │   ├── router/
│   │   │   ├── app_router.dart                      ← GoRouter config
│   │   │   ├── route_names.dart
│   │   │   └── route_guards.dart                    ← auth + device + requiresPasswordChange
│   │   ├── storage/
│   │   │   ├── secure_storage.dart                  ← flutter_secure_storage (JWT, device hash)
│   │   │   └── local_storage.dart                   ← Hive (offline queue, settings cache)
│   │   ├── theme/
│   │   │   ├── app_theme.dart
│   │   │   ├── app_colors.dart
│   │   │   ├── app_typography.dart
│   │   │   └── app_spacing.dart
│   │   └── utils/
│   │       ├── date_utils.dart
│   │       ├── validators.dart
│   │       └── extensions.dart
│   ├── shared/
│   │   └── widgets/
│   │       ├── app_button.dart
│   │       ├── app_text_field.dart
│   │       ├── shimmer_card.dart                    ← per 06.3 pre-build condition
│   │       ├── loading_overlay.dart
│   │       ├── error_widget.dart
│   │       ├── empty_state.dart
│   │       └── offline_banner.dart
│   └── features/
│       ├── auth/
│       │   ├── data/
│       │   │   ├── models/
│       │   │   │   ├── user_model.dart
│       │   │   │   └── auth_response_model.dart
│       │   │   ├── repositories/auth_repository_impl.dart
│       │   │   └── sources/auth_remote_source.dart
│       │   ├── domain/
│       │   │   ├── models/user.dart
│       │   │   └── repositories/auth_repository.dart
│       │   └── presentation/
│       │       ├── providers/
│       │       │   ├── auth_provider.dart
│       │       │   └── auth_state.dart
│       │       ├── screens/
│       │       │   ├── login_screen.dart
│       │       │   └── change_password_screen.dart
│       │       └── widgets/login_form.dart
│       ├── device_registration/
│       │   ├── data/
│       │   │   ├── models/device_model.dart
│       │   │   ├── repositories/device_repository_impl.dart
│       │   │   └── sources/device_remote_source.dart
│       │   ├── domain/
│       │   │   └── repositories/device_repository.dart
│       │   └── presentation/
│       │       ├── providers/device_provider.dart
│       │       └── screens/
│       │           ├── device_registration_screen.dart
│       │           └── new_device_screen.dart
│       ├── attendance/
│       │   ├── data/
│       │   │   ├── models/
│       │   │   │   ├── attendance_record_model.dart
│       │   │   │   └── attendance_session_model.dart
│       │   │   ├── repositories/attendance_repository_impl.dart
│       │   │   └── sources/
│       │   │       ├── attendance_remote_source.dart
│       │   │       └── attendance_local_source.dart  ← Hive offline queue
│       │   ├── domain/
│       │   │   ├── models/
│       │   │   │   ├── attendance_record.dart
│       │   │   │   └── attendance_session.dart
│       │   │   └── repositories/attendance_repository.dart
│       │   └── presentation/
│       │       ├── providers/
│       │       │   ├── attendance_provider.dart
│       │       │   └── attendance_state.dart
│       │       ├── screens/
│       │       │   ├── attendance_home_screen.dart
│       │       │   └── attendance_history_screen.dart
│       │       └── widgets/
│       │           ├── check_in_button.dart
│       │           ├── check_out_button.dart
│       │           ├── attendance_status_card.dart
│       │           └── session_list.dart
│       ├── leave/
│       │   ├── data/
│       │   │   ├── models/
│       │   │   │   ├── leave_model.dart
│       │   │   │   └── leave_balance_model.dart
│       │   │   ├── repositories/leave_repository_impl.dart
│       │   │   └── sources/leave_remote_source.dart
│       │   ├── domain/
│       │   │   ├── models/
│       │   │   │   ├── leave.dart
│       │   │   │   └── leave_balance.dart
│       │   │   └── repositories/leave_repository.dart
│       │   └── presentation/
│       │       ├── providers/
│       │       │   ├── leave_provider.dart
│       │       │   └── leave_state.dart
│       │       ├── screens/
│       │       │   ├── leave_list_screen.dart
│       │       │   ├── leave_apply_screen.dart
│       │       │   ├── leave_detail_screen.dart
│       │       │   └── leave_balance_screen.dart
│       │       └── widgets/
│       │           ├── leave_card.dart
│       │           ├── leave_type_picker.dart
│       │           └── date_range_picker.dart
│       ├── regularization/
│       │   ├── data/
│       │   │   ├── models/regularization_model.dart
│       │   │   ├── repositories/regularization_repository_impl.dart
│       │   │   └── sources/regularization_remote_source.dart
│       │   ├── domain/
│       │   │   ├── models/regularization.dart
│       │   │   └── repositories/regularization_repository.dart
│       │   └── presentation/
│       │       ├── providers/
│       │       │   ├── regularization_provider.dart
│       │       │   └── regularization_state.dart
│       │       ├── screens/
│       │       │   ├── regularization_list_screen.dart
│       │       │   └── regularization_submit_screen.dart
│       │       └── widgets/regularization_card.dart
│       ├── notifications/
│       │   ├── data/
│       │   │   ├── models/notification_model.dart
│       │   │   ├── repositories/notification_repository_impl.dart
│       │   │   └── sources/notification_remote_source.dart
│       │   ├── domain/
│       │   │   ├── models/notification.dart
│       │   │   └── repositories/notification_repository.dart
│       │   └── presentation/
│       │       ├── providers/notification_provider.dart
│       │       └── screens/
│       │           ├── notification_list_screen.dart
│       │           └── notification_detail_screen.dart
│       ├── profile/
│       │   ├── data/
│       │   │   ├── models/profile_model.dart
│       │   │   ├── repositories/profile_repository_impl.dart
│       │   │   └── sources/profile_remote_source.dart
│       │   ├── domain/
│       │   │   └── repositories/profile_repository.dart
│       │   └── presentation/
│       │       ├── providers/profile_provider.dart
│       │       └── screens/profile_screen.dart
│       └── settings/
│           ├── data/
│           │   ├── models/company_settings_model.dart
│           │   ├── repositories/settings_repository_impl.dart
│           │   └── sources/
│           │       ├── settings_remote_source.dart
│           │       └── settings_local_source.dart    ← Hive cache
│           ├── domain/
│           │   ├── models/company_settings.dart
│           │   └── repositories/settings_repository.dart
│           └── presentation/
│               └── providers/settings_provider.dart
├── test/
│   ├── features/
│   │   ├── auth/
│   │   ├── attendance/
│   │   ├── leave/
│   │   └── regularization/
│   └── core/
│       └── network/
├── integration_test/
│   └── app_test.dart
├── pubspec.yaml
├── pubspec.lock
├── analysis_options.yaml
└── .env.example                                      ← API_BASE_URL, ENVIRONMENT
```

### 1.4 `packages/types/` — Shared TypeScript Contracts

```
packages/types/
├── src/
│   ├── api.ts          ← ApiResponse<T>, PaginatedResponse<T>, ErrorBody
│   ├── enums.ts        ← DayStatus, LeaveStatus, RegularizationStatus, PayrollStatus
│   ├── errors.ts       ← error code string literals
│   └── index.ts        ← re-exports all
├── package.json        ← name: "@company/types"; main: "src/index.ts"; types: "src/index.ts" (no build step)
└── tsconfig.json
```

---

## 2. Package Strategy

### 2.1 `apps/admin` — `package.json`

#### Production Dependencies

| Package | Version | Why |
|---|---|---|
| `next` | `16.2.9` | Framework — API routes + admin portal |
| `react` | `19.2.4` | Admin portal UI |
| `react-dom` | `19.2.4` | DOM rendering |
| `mongoose` | `^8.0.0` | MongoDB ODM; v8 required (breaking changes from v7) |
| `jose` | `^5.0.0` | JWT sign/verify; works in Node runtime (not edge) |
| `bcryptjs` | `^2.4.3` | Password hashing; pure JS, no native deps |
| `@upstash/redis` | `^1.x` | Redis REST client; no persistent TCP connection (Vercel-safe) |
| `@upstash/ratelimit` | `^2.x` | Sliding window rate limiter on Upstash |
| `firebase-admin` | `^12.x` | FCM push via Firebase Admin SDK |
| `@vercel/config` | `^1.x` | `vercel.ts` typed config with `VercelConfig` type |
| `zod` | `^3.x` | Request body validation (schema + inference) |
| `date-fns` | `^3.x` | Date arithmetic (Phase 4 session, Phase 5 leave range) |
| `date-fns-tz` | `^3.x` | IST timezone conversion — required for cron IST checks |
| `swr` | `^2.x` | Admin portal data fetching + cache invalidation |
| `@tanstack/react-table` | `^8.x` | Headless data tables (employee, payroll, leave lists) |
| `recharts` | `^2.x` | Charts in reports page |
| `sonner` | `^1.x` | Toast notifications (admin portal) |
| `lucide-react` | `^0.x` | Icon set used by shadcn/ui |
| `class-variance-authority` | `^0.x` | Component variants (shadcn/ui dependency) |
| `clsx` | `^2.x` | Conditional classNames |
| `tailwind-merge` | `^2.x` | Merges Tailwind classes without conflicts |
| `@company/types` | `workspace:*` | Shared enums + API response types |

> **Radix UI primitives** (`@radix-ui/react-*`) are installed automatically by `npx shadcn@latest add`. Do not pre-install manually.

#### Development Dependencies

| Package | Version | Why |
|---|---|---|
| `typescript` | `^5.x` | TypeScript compiler |
| `@types/react` | `^19.x` | React type definitions |
| `@types/node` | `^22.x` | Node.js built-in types |
| `@types/bcryptjs` | `^2.x` | bcryptjs type definitions |
| `tsx` | `^4.x` | Run `.ts` scripts directly (`npm run seed:admin`) |
| `tailwindcss` | `^4.x` | CSS utility framework — **v4 uses CSS-first config** (see Section 5.4) |
| `@tailwindcss/postcss` | `^4.x` | PostCSS plugin for Tailwind v4 |
| `eslint` | `^9.x` | Linter |
| `eslint-config-next` | `16.2.9` | Next.js ESLint config (version must match Next.js) |
| `prettier` | `^3.x` | Formatter |

#### Testing Dependencies

| Package | Version | Why |
|---|---|---|
| `jest` | `^29.x` | Test runner |
| `jest-environment-node` | `^29.x` | Node environment for API route tests |
| `@testing-library/react` | `^16.x` | React component testing |
| `@testing-library/jest-dom` | `^6.x` | Custom jest matchers for DOM |
| `supertest` | `^7.x` | HTTP integration testing for API routes |
| `@types/supertest` | `^6.x` | supertest types |
| `mongodb-memory-server` | `^10.x` | In-memory MongoDB for integration tests |
| `@faker-js/faker` | `^9.x` | Fixture data generation |

#### Scripts (in `apps/admin/package.json`)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage",
    "seed:admin": "tsx scripts/seed-admin.ts",
    "seed:settings": "tsx scripts/seed-settings.ts",
    "seed:all": "npm run seed:settings && npm run seed:admin",
    "migrate": "tsx scripts/migrations/runner.ts up",
    "migrate:rollback": "tsx scripts/migrations/runner.ts down"
  }
}
```

### 2.2 `apps/mobile` — `pubspec.yaml`

#### Production Dependencies

| Package | Version | Why |
|---|---|---|
| `flutter_riverpod` | `^2.x` | State management |
| `riverpod_annotation` | `^2.x` | Code generation annotations for Riverpod |
| `go_router` | `^14.x` | Declarative routing; supports guards |
| `dio` | `^5.x` | HTTP client; interceptors for JWT + idempotency |
| `flutter_secure_storage` | `^9.x` | AndroidKeystore storage for JWT + device hash |
| `hive_flutter` | `^1.x` | Offline queue + settings cache |
| `firebase_core` | `^3.x` | Firebase initialization |
| `firebase_messaging` | `^15.x` | FCM push notification reception |
| `geolocator` | `^13.x` | GPS for check-in geo-fence |
| `crypto` | `^3.x` | SHA-256 device fingerprint hash |
| `device_info_plus` | `^10.x` | Device model + Android ID for fingerprint |
| `uuid` | `^4.x` | Idempotency key generation (G-004) |
| `intl` | `^0.19.x` | Date formatting (IST display) |
| `shimmer` | `^3.x` | Loading shimmer effect |
| `cached_network_image` | `^3.x` | Profile photo caching |

#### Dev Dependencies (Flutter)

| Package | Version | Why |
|---|---|---|
| `build_runner` | `^2.x` | Code generation runner |
| `riverpod_generator` | `^2.x` | Generates Riverpod providers from annotations |
| `hive_generator` | `^2.x` | Generates Hive type adapters |
| `flutter_lints` | `^5.x` | Official Flutter lint rules |
| `mocktail` | `^1.x` | Mocking for unit tests (no code gen required) |

### 2.3 Workspace Root `package.json`

```json
{
  "name": "company-hrms",
  "private": true,
  "workspaces": ["apps/admin", "packages/*"],
  "scripts": {
    "dev": "npm run dev --workspace=apps/admin",
    "build": "npm run build --workspace=apps/admin",
    "lint": "npm run lint --workspace=apps/admin",
    "typecheck": "npm run typecheck --workspace=apps/admin",
    "test": "npm run test --workspace=apps/admin",
    "seed:all": "npm run seed:all --workspace=apps/admin"
  }
}
```

> Flutter (`apps/mobile`) is excluded from npm workspaces — it uses `pubspec.yaml` / `flutter` CLI only.

---

## 3. Environment Strategy

### 3.1 `.env.example` (committed to repo — no real values)

```bash
# ── Database ─────────────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/DBNAME?retryWrites=true&w=majority

# ── Authentication ────────────────────────────────────────────────────────────
JWT_SECRET=                              # min 64 chars, cryptographically random
JWT_REFRESH_SECRET=                      # min 64 chars, different from JWT_SECRET
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_REFRESH_ABSOLUTE_EXPIRES_IN=90d      # absolute max regardless of activity

# ── Redis (Upstash) ───────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://YOUR-ENDPOINT.upstash.io
UPSTASH_REDIS_REST_TOKEN=

# ── Firebase Admin SDK ────────────────────────────────────────────────────────
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=                    # paste with literal \n for newlines

# ── Email (Brevo REST API) ────────────────────────────────────────────────────
BREVO_API_KEY=
BREVO_SENDER_EMAIL=noreply@company.com
BREVO_SENDER_NAME=Company HR

# ── Admin Seed (Phase 2 — remove ADMIN_INITIAL_PASSWORD after seed:admin) ─────
ADMIN_EMAIL=admin@company.com
ADMIN_INITIAL_PASSWORD=                  # REMOVE FROM VERCEL ENV VARS AFTER SEEDING

# ── Cron Security ─────────────────────────────────────────────────────────────
CRON_SECRET=                             # Vercel sends: Authorization: Bearer <CRON_SECRET>

# ── Application ───────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NODE_ENV=development

# ── Auto-provided by Vercel (do NOT set manually) ────────────────────────────
# VERCEL_URL           deployment URL
# VERCEL_ENV           preview | production
```

### 3.2 `.env.local` (gitignored — dev only)

Copy of `.env.example` with real dev values. Points to dev Atlas cluster (M0 free tier), dev Upstash instance, dev Firebase project.

### 3.3 Vercel Environment Configuration

| Variable Group | `preview` environment | `production` environment |
|---|---|---|
| `MONGODB_URI` | `staging_` prefixed Atlas DB | Production Atlas M10 DB |
| `UPSTASH_REDIS_REST_*` | Separate staging Redis instance | Production Redis instance |
| `FIREBASE_PROJECT_ID` | Dev Firebase project | Production Firebase project |
| `ADMIN_INITIAL_PASSWORD` | Set for staging seed | Set for production seed; **remove after seeding** |
| `NODE_ENV` | Auto-set to `production` by Vercel | Auto-set to `production` by Vercel |
| `CRON_SECRET` | Random value | Different random value |

Use `vercel env add VARIABLE_NAME` for each environment or Vercel dashboard Settings → Environment Variables.

### 3.4 Flutter Environment Strategy

Flutter uses `--dart-define-from-file` (compile-time injection — no `.env` file in APK):

```bash
# Dev build
flutter run --dart-define-from-file=.env.dev.json

# Release build (CI)
flutter build apk --release --dart-define-from-file=.env.prod.json
```

**`.env.dev.json`** (gitignored):
```json
{
  "API_BASE_URL": "http://10.0.2.2:3000/api/v1",
  "ENVIRONMENT": "development"
}
```

**`.env.prod.json`** (gitignored; stored in GitHub Secrets as `FLUTTER_ENV_PROD`):
```json
{
  "API_BASE_URL": "https://your-app.vercel.app/api/v1",
  "ENVIRONMENT": "production"
}
```

Access in Dart: `const String.fromEnvironment('API_BASE_URL')`.

`.env.example.json` (committed):
```json
{
  "API_BASE_URL": "https://your-app.vercel.app/api/v1",
  "ENVIRONMENT": "production"
}
```

---

## 4. TypeScript Strategy

### 4.1 `apps/admin/tsconfig.json`

> Read `node_modules/next/dist/docs/` for the exact tsconfig required by Next.js 16 before modifying these settings.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@models/*": ["./src/models/*"],
      "@services/*": ["./src/services/*"],
      "@repositories/*": ["./src/repositories/*"],
      "@validators/*": ["./src/validators/*"],
      "@mw/*": ["./src/middleware/*"],
      "@lib/*": ["./src/lib/*"],
      "@engines/*": ["./src/engines/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@app-types/*": ["./src/types/*"],
      "@constants/*": ["./src/constants/*"],
      "@company/types": ["../../packages/types/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

> Note: `@app-types/*` avoids collision with the `@types/` npm namespace. Use `@app-types/api`, `@app-types/jwt`, etc. in import statements.

### 4.2 Type Organization Rules

| Location | Contains | Rule |
|---|---|---|
| `src/types/enums.ts` | `DayStatus`, `LeaveStatus`, `RegularizationStatus`, `PayrollStatus`, `LeaveTypeCode` | String enums; used as literals across services |
| `src/types/api.ts` | `ApiResponse<T>`, `PaginatedResponse<T>`, `ErrorBody` | Generic wrappers; all route handlers return these |
| `src/types/jwt.ts` | `JwtPayload` | `userId`, `role`, `requiresPasswordChange`, `iat`, `exp` |
| `src/types/contracts.ts` | Cross-phase contract interfaces A–D | `AttendanceSettingsContract`, `LeaveSettingsContract`, `RegularizationSettingsContract` |
| `packages/types/src/` | Subset of above shared externally | Only enums + ApiResponse; no Mongoose types |
| Mongoose models | `.ts` files export both schema type + model | `UserDocument extends Document` |

### 4.3 No-`any` Policy

- `"strict": true` in tsconfig enforces `noImplicitAny`
- ESLint rule `@typescript-eslint/no-explicit-any: error` in `eslint.config.mjs`
- Exception: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with mandatory comment explaining why

---

## 5. MongoDB Scaffolding

### 5.1 Collection Creation Order

Collections are created implicitly by Mongoose on first write. Creation order matters only for index creation scripts. Define and run indexes in this order:

| Order | Collection | Phase | Critical Indexes |
|---|---|---|---|
| 1 | `users` | 2 | `email` unique; `role` |
| 2 | `employees` | 2 | `userId` unique; `employeeCode` unique; `status` |
| 3 | `companySettings` | 2.5 | None (single document, `findOne({})` only) |
| 4 | `systemEvents` | 1 | `eventType + date` unique compound |
| 5 | `auditLogs` | 2 | `performedBy + createdAt`; `targetId + targetType` |
| 6 | `attendanceRecords` | 4 | `employeeId + date` unique compound; `date + dayStatus` |
| 7 | `leaves` | 5 | `employeeId + status`; `startDate + endDate` range |
| 8 | `leaveYearAllocations` | 5 | `employeeId + leaveYear + leaveTypeCode` unique |
| 9 | `leaveTransactions` | 5 | `employeeId + leaveTypeCode + createdAt` |
| 10 | `regularizations` | 6 | `employeeId + date + status` |
| 11 | `payrollRecords` | 7 | `employeeId + month + year` unique compound |
| 12 | `notifications` | 8 | `userId + read`; `userId + createdAt` |

### 5.2 Index Creation Script Pattern

All indexes live in `scripts/migrations/`. Each migration file runs `db.collection.createIndex()` calls:

```
scripts/migrations/
├── runner.ts                    ← up/down orchestrator; tracks in systemEvents
├── 20260615-initial-indexes.ts  ← Phase 1–2 indexes (users, employees, systemEvents)
├── 20260616-settings.ts         ← Phase 2.5 (no indexes for companySettings)
└── ...                          ← one file per phase
```

### 5.3 Model Implementation Order (per phase)

**Phase 2:** `User` → `Employee` (stub) → `AuditLog` (stub) → `SystemEvent`

**Phase 2.5:** `CompanySettings`

**Phase 3:** `Employee` (full)

**Phase 4:** `AttendanceRecord` (with sessions[] embedded subdoc)

**Phase 5:** `Leave` → `LeaveYearAllocation` → `LeaveTransaction`

**Phase 6:** `Regularization`

**Phase 7:** `PayrollRecord` (with `staleEmployeeIds: [String]` field)

**Phase 8:** `Notification`

---

## 5.4 Tailwind CSS v4 Strategy

> Tailwind v4 is a breaking change from v3. No `tailwind.config.ts`. CSS-first configuration only.

### Installation

```bash
# apps/admin/
npm install tailwindcss@^4 @tailwindcss/postcss@^4
# Do NOT install autoprefixer separately — @tailwindcss/postcss handles it
```

### PostCSS Configuration

```javascript
// apps/admin/postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### CSS Entry Point (`src/app/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* Design tokens — replaces theme.extend in tailwind.config.ts */
  /* shadcn/ui init writes --background, --foreground, etc. here automatically */
}

/* shadcn/ui writes @layer base { :root { ... } } here on init */
```

Do **not** create `tailwind.config.ts`. Tailwind v4 ignores it. Content scanning is automatic — no `content: []` array needed.

### shadcn/ui Compatibility

`npx shadcn@latest init` detects Tailwind v4 and configures accordingly. Run from `apps/admin/`:

```bash
npx shadcn@latest init
# Prompts: Style=Default, Base color=Neutral, CSS variables=Yes,
#          RSC=Yes, Components path=src/components/ui, Utils=src/lib/utils
```

After init, smoke test: `npx shadcn@latest add button`. Verify `Button` renders with correct styles in browser before building any other component.

### What Does NOT Exist in v4

| v3 Pattern | v4 Replacement |
|---|---|
| `tailwind.config.ts` with `theme.extend` | `@theme {}` block in `globals.css` |
| `content: ['./src/**/*.{ts,tsx}']` | Automatic content scanning |
| `plugins: [require('...')]` | CSS `@plugin` directive |
| `npx tailwindcss init` | Not needed — configure in CSS |

---

## 5.5 `src/middleware.ts` Full Specification

**File location:** `apps/admin/src/middleware.ts`
**Why:** When `src/app/` is the app directory, Next.js resolves middleware from `src/middleware.ts`. Placing it at project root is silently ignored.
**Verify:** Read `node_modules/next/dist/docs/` for Next.js 16.2.9 exact placement rule before creating.

### Matcher

```typescript
export const config = {
  matcher: [
    // Match all paths except static assets, image optimization, cron routes, health
    '/((?!_next/static|_next/image|favicon\\.ico|api/cron|api/health).*)',
  ],
};
```

### Public Routes (no JWT required)

```
/(auth)/login
/(auth)/forgot-password
/(auth)/reset-password
/api/v1/auth/login
/api/v1/auth/forgot-password
/api/v1/auth/reset-password
```

### Restricted Routes (JWT required but `requiresPasswordChange: true` allowed)

```
/(auth)/change-password
/api/v1/auth/me/password
```

### Guard Chain Execution Order

```
1. Is path public?                    → Yes → pass through (NextResponse.next())
2. Is maintenance mode active?        → Yes → 503 JSON (API) or /maintenance page
3. Has valid JWT in access_token cookie? → No → 401 JSON (API) or redirect /login (page)
4. requiresPasswordChange === true?   → Yes → only /change-password and /me/password pass; all others redirect /change-password
5. Role check (admin routes)?         → Fail → 403 JSON (API) or redirect /dashboard (page)
6. CSRF token valid (state-mutating)? → Fail → 403 JSON
7. Pass through → NextResponse.next()
```

Distinguish API vs page by URL prefix: `/api/` → return JSON error; else → redirect.

JWT verification uses `jose` — compatible with Next.js middleware runtime (does not require Node.js APIs).

---

## 5.6 `instrumentation.ts` Full Specification

**File location:** `apps/admin/instrumentation.ts` (project root — NOT `src/`)
**Why:** Next.js always resolves `instrumentation.ts` from project root, regardless of `src/` presence. This is different from `middleware.ts`.

### `next.config.ts` Requirement

For Next.js ≥ 15 (stable), `instrumentationHook` requires no `experimental` flag. For Next.js 16.2.9, verify against `node_modules/next/dist/docs/` — omit if not listed:

```typescript
// apps/admin/next.config.ts — minimum required settings
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prevents Mongoose from being bundled for edge runtime
  serverExternalPackages: ['mongoose'],

  // Only include if required by Next.js 16 docs:
  // experimental: { instrumentationHook: true },
};

export default nextConfig;
```

### `instrumentation.ts` Implementation

```typescript
// apps/admin/instrumentation.ts
export async function register() {
  // REQUIRED: guard prevents Mongoose loading in edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import: prevents Mongoose parsing in edge bundle
    const { connectDB } = await import('./src/lib/db/connect');
    await connectDB();
  }
}
```

### Development Behavior

- Fires once on `npm run dev` server start
- HMR (file changes) does NOT re-fire `register()` — Mongoose stays connected
- `global.__mongoose_conn` check in `connectDB()` prevents duplicate connections
- Verify: `[DB] Mongoose connected` appears **once** in terminal at startup

### Production Behavior

- Fires once per Vercel function instance cold start
- Warm requests (Fluid Compute instance reuse): `connectDB()` returns immediately via `readyState === 1` check
- `maxPoolSize: 10` in Mongoose options — limits connections per instance to protect Atlas M10

### Vercel Compatibility

- Vercel Fluid Compute reuses instances across concurrent requests — `instrumentation.ts` ensures one connection per instance, not one per request
- `serverExternalPackages: ['mongoose']` in `next.config.ts` prevents Mongoose from being analyzed by the Next.js bundler for edge runtime

---

## 5.7 `.gitignore` Required Entries

```gitignore
# ── Next.js ──────────────────────────────────────────────────────────────────
.next/
out/
apps/admin/.next/

# ── Node.js ──────────────────────────────────────────────────────────────────
node_modules/
npm-debug.log*

# ── Environment (never commit real values) ────────────────────────────────────
.env
.env.local
.env.*.local
apps/admin/.env.local

# ── Flutter Firebase (per-environment — never commit) ─────────────────────────
apps/mobile/android/app/google-services.json

# ── Flutter signing (never commit) ────────────────────────────────────────────
apps/mobile/android/key.properties
apps/mobile/android/app/release.jks
apps/mobile/android/app/*.jks

# ── Flutter environment (compile-time inject) ──────────────────────────────────
apps/mobile/.env.dev.json
apps/mobile/.env.prod.json

# ── Flutter build ──────────────────────────────────────────────────────────────
apps/mobile/build/
apps/mobile/.dart_tool/
apps/mobile/.flutter-plugins
apps/mobile/.flutter-plugins-dependencies

# ── Deployment docs (contain secrets vault location) ──────────────────────────
DEPLOYMENT.md

# ── OS ────────────────────────────────────────────────────────────────────────
.DS_Store
Thumbs.db
```

---

## 6. Backend Scaffolding Order

### Phase 1 — Foundation (build first; nothing else starts without these)

```
lib/db/connect.ts              → Mongoose connect with exponential retry
instrumentation.ts             → export async function register() { await connectDB() }
lib/redis/client.ts            → Upstash Redis REST client init
lib/firebase/admin.ts          → Firebase Admin initializeApp()
lib/email/brevo.ts             → Brevo REST client (fetch wrapper)
lib/utils/api-response.ts      → success(data, status) / apiError(code, msg, status)
lib/utils/date-ist.ts          → getCurrentDateIST(), getCurrentMonthIST(), isWorkingDay()
lib/utils/cron-guard.ts        → validateCronSecret(request): boolean
lib/utils/hash.ts              → sha256(input): string
app/health/route.ts            → GET: DB ping + Redis ping → { status, db, redis }
vercel.ts                      → VercelConfig with 6 cron stubs
app/cron/*/route.ts            → 6 stub POST handlers (return { success: true } only)
app/admin/cron/*/route.ts      → 3 stub POST manual trigger handlers
```

> All 6 cron stubs must call `validateCronSecret(request)` before returning. Stubs return `{ success: true, jobName, executedAt }` on valid secret, 401 otherwise.

### Phase 2 — Authentication

```
models/SystemEvent.ts
models/User.ts
models/AuditLog.ts             → schema only; empty middleware stub
models/Employee.ts             → minimal fields for seed-admin; full in Phase 3
repositories/UserRepository.ts
repositories/SystemEventRepository.ts
repositories/AuditLogRepository.ts
services/AuthService.ts
lib/redis/rate-limiter.ts
lib/redis/idempotency.ts
middleware/requireAuth.ts
middleware/requireRole.ts
middleware/rateLimiter.ts
middleware/csrfMiddleware.ts
middleware/auditMiddleware.ts  → stub: logs to console; real write in Phase 8
middleware/cronGuard.ts
middleware.ts                  → Next.js route guard chain (see guard order below)
validators/auth.ts
app/api/v1/auth/*              → all 7 auth routes
scripts/seed-admin.ts          → full implementation
scripts/seed-settings.ts       → stub: no-op until Phase 2.5
```

**`middleware.ts` guard chain order** (per `05-admin-ui-ux.md` Section 0):
```
Maintenance → requiresPasswordChange → Unauthenticated → Role → CSRF
```

Only `POST /api/v1/auth/change-password` is accessible when `requiresPasswordChange: true`. All other protected routes redirect to `/change-password`.

### Phase 2.5 — Settings Bootstrap

```
models/CompanySettings.ts
repositories/SettingsRepository.ts
services/SettingsService.ts     → getSettings(), getHolidays(), getLeaveTypes(),
                                   getGeoFenceConfig(), getShiftConfig(), getWorkingDays(),
                                   seedDefaults()
validators/settings.ts          → read validators only (GET query params)
app/api/v1/settings/company/route.ts
app/api/v1/settings/holidays/route.ts
app/api/v1/settings/leave-types/route.ts
app/api/v1/settings/geofence/route.ts
app/api/v1/settings/shift/route.ts
app/api/v1/settings/working-days/route.ts
scripts/seed-settings.ts        → full implementation (idempotent)
```

### Phase 3 — Employee Management

```
models/Employee.ts              → full schema
repositories/EmployeeRepository.ts
services/EmployeeService.ts
validators/employee.ts
app/api/v1/employees/*
```

### Phase 4 — Attendance Engine

```
models/AttendanceRecord.ts      → with AttendanceSession embedded subdoc
repositories/AttendanceRepository.ts
engines/GeoFenceEngine.ts
engines/DayStatusEngine.ts
services/DayStatusService.ts    → leaveResolver param = null in Phase 4; filled Phase 5
services/AttendanceService.ts
middleware/idempotency.ts       → X-Idempotency-Key Redis check (G-004)
validators/attendance.ts
app/api/v1/attendance/*
app/api/cron/session-auto-close/route.ts        → full C-01 implementation
app/api/cron/attendance-reminder/route.ts       → full C-04 implementation
app/api/cron/checkout-reminder/route.ts         → full C-05 implementation
app/api/admin/cron/session-auto-close/route.ts  → manual trigger
```

### Phase 5 — Leave Management

```
models/Leave.ts
models/LeaveYearAllocation.ts
models/LeaveTransaction.ts
repositories/LeaveRepository.ts
repositories/LeaveYearAllocationRepository.ts
services/LeaveService.ts        → onLeaveRevoked: TODO stub for staleEmployeeIds (Phase 7)
services/LeaveBalanceService.ts
validators/leave.ts
app/api/v1/leaves/*
app/api/cron/leave-year-allocation/route.ts       → full C-02
app/api/cron/leave-carryforward-expiry/route.ts   → full C-03
app/api/admin/cron/leave-year-allocation/route.ts
app/api/admin/cron/leave-carryforward-expiry/route.ts
```

Wire `DayStatusService.leaveResolver` with `LeaveRepository` in this phase.

### Phase 6 — Regularization

```
models/Regularization.ts
repositories/RegularizationRepository.ts
services/RegularizationService.ts
validators/regularization.ts
app/api/v1/regularizations/*
```

### Phase 7 — Payroll Assistance

```
models/PayrollRecord.ts         → staleEmployeeIds: [String] field
repositories/PayrollRepository.ts
engines/PayrollEngine.ts
services/PayrollService.ts
services/PayrollLockService.ts  → Redis TTL 600s, 30s heartbeat, admin DELETE /lock
validators/payroll.ts
app/api/v1/payroll/*
app/api/cron/payroll-month-end/route.ts → full C-06
LeaveService.onLeaveRevoked     → implement staleEmployeeIds $addToSet (Contract A)
```

### Phase 8 — Notifications & Audit

```
models/Notification.ts
repositories/NotificationRepository.ts
services/NotificationService.ts
services/FcmService.ts          → FCM batch send with failed token logging
services/EmailService.ts        → Brevo REST + HTML template render
services/AuditService.ts
middleware/auditMiddleware.ts   → full implementation (replaces Phase 2 stub)
app/api/v1/notifications/*
```

### Phase 9 — Reports

```
services/ReportService.ts
app/api/v1/reports/*
```

### Phase 10 — Settings Write Endpoints (admin only)

```
validators/settings.ts          → add write validators (PATCH/POST/DELETE schemas)
app/api/v1/settings/company/route.ts     → add PATCH handler
app/api/v1/settings/holidays/route.ts    → add POST handler
app/api/v1/settings/holidays/[id]/route.ts → DELETE
app/api/v1/settings/leave-types/[code]/route.ts → PATCH
app/api/v1/settings/geofence/route.ts   → PATCH
app/api/v1/settings/shift/route.ts      → PATCH
app/api/v1/settings/working-days/route.ts → PATCH
```

---

## 7. Admin Portal Scaffolding Order

### Phase 2 — Auth Pages

```
npx shadcn@latest init                 → generates components/ui/, sets up globals.css
(auth)/layout.tsx                      → minimal centered layout (no sidebar)
(auth)/login/page.tsx
(auth)/change-password/page.tsx
(auth)/forgot-password/page.tsx
(auth)/reset-password/page.tsx
hooks/useAuth.ts
components/shared/LoadingSpinner.tsx
lib/utils/api-client.ts               → fetch wrapper with base URL + auth headers
```

### Phase 3 — Portal Shell + Employees

```
(portal)/layout.tsx
components/layout/AdminLayout.tsx
components/layout/Sidebar.tsx
components/layout/Header.tsx
components/layout/Breadcrumb.tsx
components/layout/SessionExpiredOverlay.tsx
components/shared/Pagination.tsx
components/shared/EmptyState.tsx
components/shared/ErrorBoundary.tsx
components/shared/StatusBadge.tsx
components/shared/MaintenanceBanner.tsx
(portal)/dashboard/page.tsx
(portal)/employees/page.tsx
(portal)/employees/new/page.tsx
(portal)/employees/[id]/page.tsx
components/tables/EmployeeTable.tsx
components/forms/EmployeeForm.tsx
hooks/useEmployees.ts
```

### Phases 4–9 — Feature Pages (build in phase order)

| Phase | Pages + Components |
|---|---|
| 4 | Attendance pages + AttendanceTable + AttendanceCorrectionForm + useAttendance |
| 5 | Leaves pages + LeaveTable + LeaveApprovalForm + LeaveDetailModal + useLeaves |
| 6 | Regularizations pages + RegularizationTable + RegularizationApprovalForm + useRegularizations |
| 7 | Payroll pages + PayrollTable + PayrollReopenModal + PayrollStaleBanner + usePayroll |
| 8 | Notifications + AuditLogs pages + tables + useNotifications |
| 9 | Reports page + AttendanceChart + LeaveChart |

### Phase 10 — Settings Pages

```
(portal)/settings/* pages (7 pages)
All 6 SettingsForm components
hooks/useSettings.ts
```

---

## 8. Flutter Scaffolding Order

### 8.1 Phase 2 — Project Init + Auth

```
flutter create apps/mobile --org com.company --platforms android
pubspec.yaml                → all production + dev dependencies
analysis_options.yaml       → flutter_lints + custom rules
android/app/build.gradle    → minSdk 23, compileSdk 35, signing config
android/app/src/main/AndroidManifest.xml → permissions (see 9.1)
lib/core/theme/*            → all 4 theme files
lib/core/constants/*
lib/core/error/*
lib/core/storage/secure_storage.dart
lib/core/storage/local_storage.dart   → Hive init (register adapters)
lib/core/network/api_client.dart
lib/core/network/interceptors/*       → auth, idempotency, logging
lib/core/di/providers.dart
lib/core/utils/*
lib/shared/widgets/*                  → all 7 shared widgets (incl. shimmer_card.dart)
lib/features/device_registration/*    → full feature (device hash, registration, new device)
lib/features/auth/*                   → full feature (login, change-password)
lib/core/router/app_router.dart       → GoRouter with initial route + guards
lib/app.dart
lib/main.dart
```

> Implement `ShimmerCard` widget before building any feature screen. Required per `06.3-mobile-ui-final-validation.md` condition 4.

### 8.2 Phase 4 — Attendance Feature

```
lib/features/attendance/data/sources/attendance_local_source.dart  → Hive offline queue
lib/features/attendance/data/sources/attendance_remote_source.dart
lib/features/attendance/data/repositories/attendance_repository_impl.dart
lib/features/attendance/domain/*
lib/features/attendance/presentation/*
```

Offline queue strategy: `HiveBox<PendingAction>` stores `{ type, payload, idempotencyKey }`. Flush on next connectivity event.

### 8.3 Phases 5–9 — Feature Order

| Phase | Flutter Feature |
|---|---|
| 5 | `leave/` feature (all layers) |
| 6 | `regularization/` feature |
| 8 | Firebase Messaging setup + `notifications/` feature |
| 11 | `profile/` + `settings/` (read-only Hive cache) |

### 9.1 `AndroidManifest.xml` — Required Permissions

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`ACCESS_FINE_LOCATION` is required for geo-fence check-in. `POST_NOTIFICATIONS` required for Android 13+ FCM.

---

## 9. CI/CD Scaffolding

### 9.1 `.github/workflows/ci.yml` — Next.js CI

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
jobs:
  admin:
    name: Admin lint + typecheck + test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/admin
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci --workspace=apps/admin --workspace=packages/types
      - run: npm run lint
      - run: npm run typecheck
      - name: Test (stub — no real DB)
        run: npm run test:ci
        env:
          MONGODB_URI: ${{ secrets.TEST_MONGODB_URI }}
          JWT_SECRET: test-secret-min-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
          JWT_REFRESH_SECRET: test-refresh-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
          UPSTASH_REDIS_REST_URL: ${{ secrets.TEST_UPSTASH_URL }}
          UPSTASH_REDIS_REST_TOKEN: ${{ secrets.TEST_UPSTASH_TOKEN }}
```

### 9.2 `.github/workflows/mobile-ci.yml` — Flutter CI

```yaml
name: Mobile CI
on:
  pull_request:
    branches: [main, develop]
jobs:
  flutter:
    name: Flutter analyze + test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.x'
          channel: 'stable'
          cache: true
      - run: flutter pub get
      - run: flutter analyze --fatal-infos
      - run: flutter test
```

### 9.3 `.github/workflows/mobile-release.yml` — APK Build + Distribute

```yaml
name: Mobile Release
on:
  push:
    branches: [main]
jobs:
  release:
    name: Build APK + Firebase Distribution
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.x'
          channel: 'stable'
      - name: Write prod env file
        run: echo '${{ secrets.FLUTTER_ENV_PROD }}' > .env.prod.json
      - name: Write google-services.json (production Firebase)
        run: |
          echo '${{ secrets.GOOGLE_SERVICES_JSON_PROD }}' | base64 --decode \
            > android/app/google-services.json
      - name: Write signing key
        run: |
          echo '${{ secrets.ANDROID_KEYSTORE_BASE64 }}' | base64 --decode > android/app/release.jks
          echo '${{ secrets.KEY_PROPERTIES }}' > android/key.properties
      - run: flutter pub get
      - run: flutter build apk --release --dart-define-from-file=.env.prod.json
      - name: Distribute via Firebase App Distribution
        uses: wzieba/Firebase-Distribution-Github-Action@v1
        with:
          appId: ${{ secrets.FIREBASE_APP_ID }}
          serviceCredentialsFileContent: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          groups: internal-testers
          file: build/app/outputs/flutter-apk/app-release.apk
          releaseNotes: "Build from ${{ github.sha }}"
```

### 9.4 GitHub Secrets Required

| Secret | Used By | Notes |
|---|---|---|
| `TEST_MONGODB_URI` | `ci.yml` | mongodb-memory-server or dedicated test Atlas M0 |
| `TEST_UPSTASH_URL` | `ci.yml` | Test Upstash instance |
| `TEST_UPSTASH_TOKEN` | `ci.yml` | Test Upstash token |
| `FLUTTER_ENV_PROD` | `mobile-release.yml` | Contents of `.env.prod.json` |
| `ANDROID_KEYSTORE_BASE64` | `mobile-release.yml` | `base64 release.jks` |
| `KEY_PROPERTIES` | `mobile-release.yml` | `storePassword=...\nkeyPassword=...\n...` |
| `GOOGLE_SERVICES_JSON_PROD` | `mobile-release.yml` | `base64 google-services.json` from `company-hrms-prod` Firebase project |
| `FIREBASE_APP_ID` | `mobile-release.yml` | Firebase App Distribution app ID |
| `FIREBASE_SERVICE_ACCOUNT` | `mobile-release.yml` | Firebase service account JSON |

### 9.5 Vercel Configuration

`vercel.ts` (in `apps/admin/`):
```typescript
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/session-auto-close',        schedule: '0 18 * * *'      }, // 23:30 IST
    { path: '/api/cron/leave-year-allocation',     schedule: '35 18 28-31 * *'  }, // 00:05 IST check
    { path: '/api/cron/leave-carryforward-expiry', schedule: '35 18 28-31 * *'  }, // 00:05 IST check
    { path: '/api/cron/attendance-reminder',       schedule: '0 5 * * 1-5'     }, // 10:30 IST Mon–Fri
    { path: '/api/cron/checkout-reminder',         schedule: '0 13 * * 1-5'    }, // 18:30 IST Mon–Fri
    { path: '/api/cron/payroll-month-end',         schedule: '30 3 28-31 * *'   }, // 09:00 IST last-day
  ],
};
```

> Read `node_modules/next/dist/docs/` and `@vercel/config` package docs before writing final `vercel.ts`. Import syntax may differ from above.

### 9.6 Atlas Setup Checklist

- [ ] M10 cluster provisioned (use M0 for dev/staging)
- [ ] Database user created with `readWrite` role on DBNAME
- [ ] IP allowlist: `0.0.0.0/0` (Vercel has dynamic IPs)
- [ ] Connection string uses SRV format (`mongodb+srv://`)
- [ ] Staging: separate database `staging_<DBNAME>` on same cluster (or separate M0)

---

## 10. Coding Standards

### 10.1 Backend (Next.js)

| Rule | Standard |
|---|---|
| Route handlers | Thin: parse → validate → call service → return ApiResponse |
| Services | All business logic; no direct DB calls |
| Repositories | All DB queries; no business logic; return domain types (not Mongoose docs) |
| Engines | Pure functions; no I/O; fully unit testable in isolation |
| Error handling | All errors extend `AppError`; caught at route handler boundary |
| Types | No `any`; no `as unknown`; use Zod inference for request types |
| Imports | Use path aliases (`@services/`, `@models/`, etc.); no relative `../../` beyond 1 level |
| Environment | Never access `process.env` inside services; inject via constructor or function param |
| Logging | No `console.log` in production code; `console.error` only in catch blocks at boundaries |

### 10.2 Admin Portal (React)

| Rule | Standard |
|---|---|
| Data fetching | SWR hooks only; no raw `fetch` in components |
| State | No global state stores; SWR cache is the source of truth |
| Forms | `react-hook-form` + Zod resolver (install with shadcn form components) |
| Components | Server Components by default; `'use client'` only when needed |
| Styling | Tailwind utility classes; no inline `style` prop; no CSS modules |
| Naming | PascalCase components; camelCase hooks (`use` prefix); kebab-case files |

### 10.3 Flutter (Dart)

| Rule | Standard |
|---|---|
| Architecture | Feature-first; data/domain/presentation layers per feature |
| State | Riverpod `AsyncNotifier` for all async state |
| Naming | `snake_case` files; `PascalCase` classes; `camelCase` methods |
| Types | No `dynamic`; use generated models with Hive/JSON annotations |
| Error handling | `Either<Failure, T>` pattern in repositories; no raw exceptions in presentation |
| API calls | All through `*_remote_source.dart`; never call Dio directly from providers |

---

## 11. Branch Strategy

| Branch | Purpose | Deploy | Protected |
|---|---|---|---|
| `main` | Production code | Vercel production auto-deploy | Yes — PR + CI required |
| `develop` | Integration / staging | Vercel staging (manual promote) | Yes — PR + CI required |
| `feature/{description}` | New features | Vercel preview (auto on PR) | No |
| `fix/{description}` | Bug fixes | Vercel preview | No |
| `chore/{description}` | Tooling, deps, scaffold | Vercel preview | No |

**Flow:** `feature/*` → PR → `develop` → test on staging → PR → `main` → production

**Merge strategy:** Squash merge to `develop`; merge commit to `main` (preserves deploy history).

---

## 12. Commit Strategy

Conventional Commits format: `type(scope): description`

| Type | When |
|---|---|
| `feat` | New feature or endpoint |
| `fix` | Bug fix |
| `chore` | Tooling, deps, config, scaffold, migrations |
| `test` | Test additions or fixes |
| `docs` | Documentation only |
| `refactor` | Code restructure without behavior change |

**Scopes:** `auth`, `attendance`, `leave`, `regularization`, `payroll`, `notifications`, `settings`, `reports`, `mobile`, `admin`, `db`, `cron`, `ci`, `scaffold`

**Examples:**
```
chore(scaffold): initialize Next.js admin app with vercel.ts
feat(auth): implement JWT login with device fingerprint validation
fix(cron): correct leave-year-allocation UTC expression
test(attendance): add DayStatusEngine unit test matrix
```

---

## 13. Definition of Scaffold Complete

Scaffold is complete when ALL of the following pass:

### Infrastructure
- [ ] `npm install` at workspace root completes without errors
- [ ] `packages/types` compiles (`tsc --noEmit` in `packages/types`)
- [ ] `GET /api/v1/health` returns `{ status: "ok", db: "connected", redis: "connected" }`
- [ ] All 6 cron stub routes return `{ success: true, jobName, executedAt }` with valid `CRON_SECRET`
- [ ] All 6 cron stub routes return `401` without `CRON_SECRET`
- [ ] 3 admin manual cron routes return `401` without valid admin JWT

### Next.js Admin App
- [ ] `npm run dev` starts without error in `apps/admin`
- [ ] `npm run build` completes without TypeScript errors
- [ ] `npm run typecheck` returns 0 errors
- [ ] `npm run lint` returns 0 errors
- [ ] All path aliases resolve (`@models/*`, `@services/*`, etc.)
- [ ] `middleware.ts` guard chain active: unauthenticated `/dashboard` redirects to `/login`
- [ ] `instrumentation.ts` `register()` executes on server start (log line visible in `npm run dev`)

### Auth Flow (browser test)
- [ ] `npm run seed:settings` runs without error (idempotent on re-run)
- [ ] `npm run seed:admin` creates admin in dev DB (idempotent on re-run)
- [ ] `/login` → correct credentials → redirected to `/change-password` (requiresPasswordChange)
- [ ] `/change-password` → new password → redirected to `/dashboard`
- [ ] After password change, `/login` → `/dashboard` directly (no more forced change)

### Flutter Mobile App
- [ ] `flutter pub get` completes in `apps/mobile`
- [ ] `flutter analyze --fatal-infos` returns 0 issues
- [ ] `flutter build apk --debug` succeeds
- [ ] `flutter test` passes (stub tests)
- [ ] `main.dart` launches on emulator/device without crash

### CI/CD
- [ ] GitHub Actions `ci.yml` green on PR to `develop`
- [ ] GitHub Actions `mobile-ci.yml` green on PR to `develop`
- [ ] Vercel preview deployment live on PR
- [ ] All GitHub Secrets documented (not necessarily set — scaffolding only)

### Documentation
- [ ] `.env.example` committed with all variables documented
- [ ] `scripts/migrations/.gitkeep` committed (directory exists)
- [ ] `DEPLOYMENT.md` created at workspace root (gitignored) — documents secrets location, seed steps, first-login procedure

### Structure Verification
- [ ] Folder structure matches Section 1 of this document exactly
- [ ] All 13 Mongoose model stub files exist (`models/index.ts` re-exports all)
- [ ] All 14 service stub files exist
- [ ] All 11 repository stub files exist
- [ ] All 3 engine stub files exist

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-06-15 | Initial scaffolding specification |
| v1.1 | 2026-06-15 | Remediation: `middleware.ts` → `src/`; `instrumentation.ts` runtime guard; Tailwind v4 strategy; Firebase CI injection; `.gitignore` entries; `packages/types` no-build-step; `postcss.config.mjs` added |
