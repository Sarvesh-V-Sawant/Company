# 09 — Scaffold Verification
**Workforce Management Platform**  
Reference: `docs/08-project-scaffolding.md` v1.1 · `docs/08.2-scaffolding-remediation.md` · `docs/08.3-scaffolding-final-validation.md`  
Date: 2026-06-16  
Status: **VERIFIED**

---

## Validation Checks

### Admin — `npm run lint`
```
Result: ✅ PASS — 0 errors, 0 warnings
```

**Fixes applied:**
- `next lint` removed in Next.js 16 — replaced with `eslint .` in package.json
- `eslint.config.mjs` rewritten from `FlatCompat` (circular reference bug) to native ESLint 9 flat config importing `eslint-config-next` v16 array directly
- `postcss.config.mjs` assigned to variable before export (import/no-anonymous-default-export)
- `src/lib/db/connect.ts` unused lint-disable comment removed

---

### Admin — `npm run typecheck`
```
Result: ✅ PASS — 0 errors
```

**Fixes applied:**
- `jest.config.ts`: `setupFilesAfterFramework` → `setupFilesAfterEnv` (TS2353 — invalid Jest config key)
- `scripts/seed-admin.ts` + `scripts/seed-settings.ts`: Added `export` keyword to `main()` — files without imports/exports are treated as scripts by TypeScript, causing duplicate global `main` declarations (TS2393)
- `src/models/CompanySettings.ts`: `interface ICompanySettings extends Document` with `_id: string` conflicted with `Document`'s default `_id: ObjectId` — changed to `extends Document<string>` and removed explicit `_id` field (TS2430)

---

### Admin — `npm run build`
```
Result: ✅ PASS — Compiled successfully (Next.js 16.2.9 Turbopack)
63 routes compiled. 0 build errors. 0 TypeScript errors.
```

**Breaking change detected and fixed:**
- Next.js 16 deprecated `middleware.ts` in favour of `proxy.ts` with `export async function proxy()`.  
  `src/middleware.ts` → `src/proxy.ts`, function renamed `middleware` → `proxy`.  
  Build warning `"The 'middleware' file convention is deprecated"` eliminated.

**Expected warnings (no action needed):**
- `[Upstash Redis] The 'url' property is missing` — expected; no `UPSTASH_REDIS_REST_URL` set in build environment
- `tsconfig.json` auto-updated by Next.js: `jsx` changed from `preserve` to `react-jsx`, `.next/dev/types/**/*.ts` added to `include` — correct behavior, both changes acceptable

---

### Shared Package — `packages/types`
```
Result: ✅ PASS — No build step required
```

`package.json`: `"main": "src/index.ts"`, `"types": "src/index.ts"`  
`apps/admin/tsconfig.json` path alias: `"@company/types": ["../../packages/types/src/index.ts"]`  
TypeScript resolves directly from source — no `tsc` compilation needed.

---

### Mobile — `flutter analyze`
```
Result: ✅ PASS — No issues found (0 errors, 0 warnings, 0 infos)
```
Ran in 4.0s. See `docs/09.1-mobile-project-validation.md` for full Flutter verification.

---

## Structure Verification

### Repository Root
| Item | Status |
|---|---|
| `.gitignore` | ✅ Present |
| `.npmrc` | ✅ Present |
| `package.json` (workspace root) | ✅ Present |
| `.github/workflows/ci.yml` | ✅ Present |
| `.github/workflows/mobile-ci.yml` | ✅ Present |
| `.github/workflows/mobile-release.yml` | ✅ Present |
| `.github/pull_request_template.md` | ✅ Present |
| `apps/admin/` | ✅ Present |
| `apps/mobile/` | ✅ Present |
| `packages/types/` | ✅ Present |

---

### `apps/admin/` — Config Files
| File | Status | Note |
|---|---|---|
| `instrumentation.ts` | ✅ Present | At project root (not src/) — correct |
| `next.config.ts` | ✅ Present | `serverExternalPackages: ['mongoose']` |
| `vercel.ts` | ✅ Present | 6 cron definitions |
| `postcss.config.mjs` | ✅ Present | Tailwind v4 |
| `eslint.config.mjs` | ✅ Present | ESLint 9 flat config |
| `.prettierrc` | ✅ Present | |
| `jest.config.ts` | ✅ Present | Fixed: `setupFilesAfterEnv` |
| `jest.setup.ts` | ✅ Present | |
| `tsconfig.json` | ✅ Present | Auto-updated by Next.js (jsx: react-jsx) |
| `public/favicon.ico` | ✅ Present | Created placeholder |

---

### `apps/admin/src/` — Backend Layer Counts

| Layer | Actual | Spec | Status |
|---|---|---|---|
| Models (`src/models/*.ts` excl. index) | 12 | 12 | ✅ |
| Services (`src/services/*.ts`) | 15 | 15 | ✅ |
| Repositories (`src/repositories/*.ts`) | 11 | 11 | ✅ |
| Engines (`src/engines/*.ts`) | 3 | 3 | ✅ |
| Validators (`src/validators/*.ts`) | 7 | 7 | ✅ |

---

### `apps/admin/src/` — Key Files
| File | Status |
|---|---|
| `src/proxy.ts` | ✅ Present (renamed from middleware.ts per Next.js 16) |
| `src/middleware/requireAuth.ts` | ✅ Present |
| `src/middleware/requireRole.ts` | ✅ Present |
| `src/middleware/cronGuard.ts` | ✅ Present |
| `src/middleware/rateLimiter.ts` | ✅ Present |
| `src/middleware/idempotency.ts` | ✅ Present |
| `src/middleware/auditMiddleware.ts` | ✅ Present |
| `src/middleware/csrfMiddleware.ts` | ✅ Present |
| `src/models/index.ts` | ✅ Present |
| `src/types/api.ts` | ✅ Present |
| `src/types/jwt.ts` | ✅ Present |
| `src/types/enums.ts` | ✅ Present |
| `src/types/contracts.ts` | ✅ Present |
| `src/lib/db/connect.ts` | ✅ Present |
| `src/lib/redis/client.ts` | ✅ Present |
| `src/lib/firebase/admin.ts` | ✅ Present |
| `src/lib/email/brevo.ts` | ✅ Present |
| `src/lib/utils/api-response.ts` | ✅ Present |
| `src/lib/utils/date-ist.ts` | ✅ Present |
| `src/lib/utils/cron-guard.ts` | ✅ Present |
| `src/lib/utils/hash.ts` | ✅ Present |

---

### `apps/admin/src/` — API Routes

| Route Group | Count | Status |
|---|---|---|
| Auth routes (`/api/v1/auth/*`) | 8 | ✅ |
| Employee routes (`/api/v1/employees/*`) | 2 | ✅ |
| Attendance routes (`/api/v1/attendance/*`) | 5 | ✅ |
| Leave routes (`/api/v1/leaves/*`) | 6 | ✅ |
| Regularization routes (`/api/v1/regularizations/*`) | 5 | ✅ |
| Payroll routes (`/api/v1/payroll/*`) | 4 | ✅ |
| Notification routes (`/api/v1/notifications/*`) | 5 | ✅ |
| Settings routes (`/api/v1/settings/*`) | 9 | ✅ |
| Report routes (`/api/v1/reports/*`) | 3 | ✅ |
| Cron routes (`/cron/*`) | 6 | ✅ |
| Admin cron routes (`/admin/cron/*`) | 3 | ✅ |
| Health route | 1 | ✅ |
| **Total** | **57** | ✅ |

---

### `apps/admin/src/` — Frontend

| Component Group | Count | Status |
|---|---|---|
| Auth pages (`(auth)/*`) | 5 | ✅ |
| Portal pages (`(portal)/*`) | 21 | ✅ |
| Layout components | 5 | ✅ |
| Table components | 7 | ✅ |
| Form components | 10 | ✅ |
| Modal components | 4 | ✅ |
| Chart components | 2 | ✅ |
| Shared components | 7 | ✅ |
| Hooks | 9 | ✅ |

---

### `packages/types/`
| File | Status |
|---|---|
| `src/api.ts` | ✅ Present |
| `src/enums.ts` | ✅ Present |
| `src/errors.ts` | ✅ Present |
| `src/index.ts` | ✅ Present |
| `package.json` (`main: src/index.ts`) | ✅ Correct |
| `tsconfig.json` | ✅ Present |

---

### `apps/mobile/`
| Item | Status |
|---|---|
| `android/` (complete Gradle structure) | ✅ Present |
| `ios/` (Xcode project) | ✅ Present |
| `web/` | ✅ Present |
| `lib/` (28 Dart source files) | ✅ Present |
| `test/` | ✅ Present |
| `pubspec.yaml` | ✅ Present |
| `pubspec.lock` | ✅ Present (flutter pub get) |
| `analysis_options.yaml` | ✅ Present |
| `.env.example.json` | ✅ Present |

---

### CI/CD
| File | Status |
|---|---|
| `.github/workflows/ci.yml` | ✅ Present |
| `.github/workflows/mobile-ci.yml` | ✅ Present |
| `.github/workflows/mobile-release.yml` | ✅ Present |
| `apps/admin/vercel.ts` (6 cron defs) | ✅ Present |

---

## Path Aliases Verification

`apps/admin/tsconfig.json` path aliases:

| Alias | Target | Status |
|---|---|---|
| `@/*` | `./src/*` | ✅ |
| `@models/*` | `./src/models/*` | ✅ |
| `@services/*` | `./src/services/*` | ✅ |
| `@repositories/*` | `./src/repositories/*` | ✅ |
| `@validators/*` | `./src/validators/*` | ✅ |
| `@mw/*` | `./src/middleware/*` | ✅ |
| `@lib/*` | `./src/lib/*` | ✅ |
| `@engines/*` | `./src/engines/*` | ✅ |
| `@components/*` | `./src/components/*` | ✅ |
| `@hooks/*` | `./src/hooks/*` | ✅ |
| `@app-types/*` | `./src/types/*` | ✅ |
| `@constants/*` | `./src/constants/*` | ✅ |
| `@company/types` | `../../packages/types/src/index.ts` | ✅ |

All 13 path aliases verified in `tsconfig.json`. All resolve correctly (typecheck: 0 errors).

---

## Breaking Changes Found and Resolved

| # | Change | Impact | Resolution |
|---|---|---|---|
| BC-01 | `next lint` removed in Next.js 16 | Lint script broken | Updated to `eslint .`; rewrote `eslint.config.mjs` for ESLint 9 flat config |
| BC-02 | `src/middleware.ts` deprecated in Next.js 16 | Auth guard silently broken at next major | Renamed to `src/proxy.ts`, function renamed `middleware` → `proxy` |
| BC-03 | `eslint-config-next` v16 now exports native flat config | `FlatCompat` caused circular JSON error | Import directly: `import nextConfig from 'eslint-config-next'` |

---

## Open Items (Non-Blocking)

These are carry-forward items from `docs/08.3-scaffolding-final-validation.md` — all scoped to Phase 2 or later:

| Finding | Title | Resolve Before |
|---|---|---|
| S-SC-005 | `react-hook-form` not in deps | Phase 2 first form |
| S-SC-006 | `scripts/migrations/runner.ts` not scaffolded | Phase 2 start |
| S-SC-007 | SWR vs Server Components strategy | Phase 3 portal build |
| S-SC-008 | Jest config correctness for Next.js 16 | Phase 2 first test |
| S-SC-009 | `src/lib/utils/api-client.ts` not in Phase 2 order | Phase 2 admin portal |

None block Phase 2 Authentication implementation.

---

## Validation Summary

| Check | Result |
|---|---|
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm run typecheck` | ✅ 0 errors |
| `npm run build` | ✅ Compiled successfully (63 routes) |
| `packages/types` (no-build-step) | ✅ Source resolution via tsconfig paths |
| `flutter analyze` | ✅ 0 issues |
| Structure vs spec | ✅ All counts match |
| Path aliases | ✅ All 13 resolve |
| Workspace linking | ✅ `@company/types` resolves |
| Breaking changes | ✅ 3 found and fixed |
