# Phase 14 — Production Readiness Review

**Date:** 2026-06-21
**Reviewer:** Fork agent — independent review
**Basis:** Phase 13 UAT PASSED (95/100, 77/81 PASS, 0 FAIL · docs/21-uat-validation.md)
**Prior system score:** 84/100, 0C + 0H (docs/20.2-final-system-revalidation.md)
**Decision rule:** CRITICAL or HIGH finding → STOP

---

## Executive Summary

Production readiness review found **2 CRITICAL** and **2 HIGH** findings that block production deployment.

Both CRITICAL findings are in the mobile release track: Firebase configuration files were never generated/committed (`google-services.json`, `firebase_options.dart`), and the Android release build is configured to sign with the debug keystore. The two HIGH findings are absent production error monitoring and placeholder Android app identity values.

The backend/admin portal is production-ready at the infrastructure level. MongoDB connection pooling is correct for serverless. Rate limiting uses Upstash Redis (survives Vercel cold starts). All environment variables are identified. Vercel cron configuration is valid. All previous CRITICAL and HIGH code findings are verified resolved.

**Verdict: STOP — resolve C1, C2, H1, H2 before deployment.**

---

## Production Readiness Score

| Area | Weight | Score | Notes |
|------|--------|-------|-------|
| Infrastructure Readiness | 15% | 11/15 | Connection pooling correct; indexes defined; no Atlas backup SLA documented |
| Firebase Readiness | 10% | 1/10 | Config files missing — CRITICAL |
| Environment Configuration | 10% | 7/10 | 15 vars identified; 1 mismatch; 1 undocumented |
| Deployment Readiness | 10% | 6/10 | Vercel config valid; debug signing — CRITICAL |
| Security Review | 15% | 12/15 | Upstash rate limiting solid; JWT rotation ready; hashIpAddress fallback remains |
| Monitoring & Operations | 15% | 3/15 | No APM/Sentry; no alerting; no runbooks |
| Mobile Release Readiness | 15% | 3/15 | Firebase missing; debug signing; placeholder app identity |
| Production Risk Assessment | 5% | 3/5 | Known risks documented; no load test data |
| Testing Coverage | 5% | 4/5 | 286 backend + 97 mobile; no integration tests |
| **Total** | **100%** | **50/100** | |

---

## Critical Findings

### C1 — Firebase Configuration Files Missing

**Severity:** CRITICAL — Mobile app cannot use Firebase/FCM without these files.

| File | Expected Path | Found |
|------|--------------|-------|
| `google-services.json` | `apps/mobile/android/app/google-services.json` | NOT FOUND |
| `firebase_options.dart` | `apps/mobile/lib/firebase_options.dart` | NOT FOUND |
| `GoogleService-Info.plist` | `apps/mobile/ios/Runner/GoogleService-Info.plist` | NOT FOUND |

**Impact:**
- Flutter build fails at Firebase initialization (`FirebaseOptions` is unresolved)
- `FcmService.initialize()` called in `apps/mobile/lib/main.dart` — throws at runtime without `firebase_options.dart`
- All push notifications (attendance reminders, leave approvals, regularization updates) are dead
- Cold-start notification routing (`initialNotificationRouteProvider`) dead

**Resolution:**
1. Go to Firebase Console → Project Settings → Add Android app (package: `com.company.company_mobile`)
2. Download `google-services.json` → place at `apps/mobile/android/app/google-services.json`
3. Run `flutterfire configure` to generate `apps/mobile/lib/firebase_options.dart`
4. For iOS: Add iOS app in Firebase Console → download `GoogleService-Info.plist` → place in `apps/mobile/ios/Runner/`
5. Do NOT commit `google-services.json` or `GoogleService-Info.plist` to git if the repo is public

---

### C2 — Android Release Build Signed with Debug Keystore

**Severity:** CRITICAL — Play Store submission blocked.

**Evidence:** `apps/mobile/android/app/build.gradle.kts:36-38`
```kotlin
release {
    // TODO: Add your own signing config for the release build.
    signingConfig = signingConfigs.getByName("debug")
}
```

The `TODO` comment confirms this was never completed. APKs signed with the debug keystore are rejected by Google Play.

**Impact:**
- `flutter build apk --release` produces a debug-signed APK
- Google Play Console upload fails at signature validation
- iOS App Store requires a distribution certificate (separate concern, also unresolved)

**Resolution:**
1. Generate a release keystore: `keytool -genkey -v -keystore company-release.jks -alias company -keyalg RSA -keysize 2048 -validity 10000`
2. Store keystore securely (NOT in git)
3. Create `apps/mobile/android/key.properties` (gitignored):
   ```
   storePassword=<password>
   keyPassword=<password>
   keyAlias=company
   storeFile=../company-release.jks
   ```
4. Update `build.gradle.kts` to reference `key.properties` for release signing config

---

## High Findings

### H1 — No Production Error Monitoring

**Severity:** HIGH — production incidents will be invisible.

**Evidence:** Grep across `apps/admin/src` for `sentry`, `datadog`, `newrelic`, `pino`, `winston`, `logger` → **zero matches**.

Only logging in the entire backend is:
```typescript
// apps/admin/src/lib/db/connect.ts:25
console.error('[DB] Mongoose connected');
```

**Impact:**
- Unhandled API exceptions, DB timeouts, FCM delivery failures, cron job errors: all silent
- No error rate alerting — production outage could persist until a user reports it
- No request tracing, no performance metrics
- Vercel provides basic function logs but no error aggregation or alerting

**Resolution (P0 — before go-live):**
- Integrate Sentry: `npm install @sentry/nextjs` + `sentry.server.config.ts` + `SENTRY_DSN` env var
- Add `SENTRY_DSN` to Vercel environment variables
- Configure error alerts for `p50 > 2s`, `error rate > 1%`, `cron failures`
- Alternatively: Vercel Log Drains → Axiom/Datadog (lower effort, lower fidelity)

---

### H2 — Android App Identity is Placeholder

**Severity:** HIGH — Play Store submission requires unique, production-ready app identity.

**Evidence:**
- `apps/mobile/android/app/build.gradle.kts:9`: `namespace = "com.company.company_mobile"`
- `apps/mobile/android/app/build.gradle.kts:27`: `applicationId = "com.company.company_mobile"`
- `apps/mobile/android/app/src/main/AndroidManifest.xml:3`: `android:label="company_mobile"`

**Issues:**
1. `applicationId` — must match the app registered in Google Play Console; cannot be changed after first release
2. `android:label="company_mobile"` — underscore label is placeholder; users see this as the app name
3. Both values use the generic `company` placeholder rather than the actual company name

**Resolution:**
1. Choose final `applicationId` (e.g., `com.acmecorp.hrms`) — this is permanent
2. Register this applicationId in Google Play Console
3. Update `build.gradle.kts` applicationId and namespace
4. Update `AndroidManifest.xml` label to production app name (e.g., `"AcmeCorp HR"`)
5. Update `pubspec.yaml` name if needed

---

## Medium Findings

| ID | Source | Finding | File:Line |
|----|--------|---------|-----------|
| M1 | Phase 12 carry-forward | AuditLog schema missing `actorRole`, `actorEmail`, TTL index | `src/models/AuditLog.ts:14` |
| M2 | **New** | `JWT_REFRESH_SECRET` documented in `.env.example:7-8` but never used — refresh tokens are opaque random strings hashed with SHA-256, not JWTs; ops team will configure a dead variable | `.env.example:7` |
| M3 | Phase 12 carry-forward | No API route integration tests | `apps/admin/src/__tests__/` |
| M4 | Phase 12 carry-forward | `hashIpAddress` uses `'fallback'` HMAC key when `JWT_SECRET` unset | `src/lib/utils/hash.ts:8` |
| M5 | Phase 13 carry-forward | Mobile offline mode not functional (no `connectivity_plus`, no retry queue) | `apps/mobile/` |
| M6 | Phase 13 carry-forward | `requiresPasswordChange` flag not enforced on cold app restore | `apps/mobile/lib/features/auth/` |
| M7 | **New** | `MAINTENANCE_MODE` env var used at `proxy.ts:93` but absent from `.env.example` and not documented | `src/proxy.ts:93` |
| M8 | **New** | `ADMIN_INITIAL_PASSWORD` must be manually deleted from Vercel env vars after seeding; no automated guard or reminder | `.env.example:27` |

---

## Low Findings

All L1–L8 from Phase 11 (`docs/19.3-mobile-app-final-validation.md`) remain open:

| ID | Finding |
|----|---------|
| L1 | `app_links` absent — no external deep links |
| L2 | Leave/Regularization history status filter not implemented |
| L3 | Notification permission status not shown on Profile screen |
| L4 | App version not shown on Device Info screen |
| L5 | `shimmer_card.dart` imports removed package |
| L6 | `PendingSubmissionBanner` not implemented |
| L7 | Weekly attendance URL state not persisted |
| L8 | Payroll remote source in wrong directory |

---

## Deployment Blockers

| Blocker | Type | Blocking What |
|---------|------|---------------|
| `google-services.json` missing | C1 | Mobile build + FCM |
| `firebase_options.dart` missing | C1 | Mobile build |
| Release keystore not configured | C2 | Play Store submission |
| App identity is placeholder | H2 | Play Store registration |
| No error monitoring | H1 | Production ops viability |

---

## Infrastructure Gaps (Non-Blocking, Required Before Go-Live)

| Gap | Notes |
|-----|-------|
| MongoDB Atlas tier | M10+ recommended for production (M0/M2 Shared has no guaranteed IOPS) |
| Atlas automated backups | Enable continuous backup or scheduled snapshots in Atlas console |
| Atlas network peering / IP allowlist | Vercel IPs are dynamic; use Atlas 0.0.0.0/0 allowlist or Vercel IP ranges |
| Connection pool vs serverless | `maxPoolSize: 10` set; Vercel function concurrency may open > 10 connections; monitor Atlas connection count |
| Redis (Upstash) — region | Ensure Upstash Redis region matches Vercel deployment region (latency) |

---

## Required Environment Variables

| Variable | Required | Used In | Notes |
|----------|----------|---------|-------|
| `MONGODB_URI` | REQUIRED | `src/lib/db/connect.ts:15` | MongoDB Atlas connection string |
| `JWT_SECRET` | REQUIRED | `src/proxy.ts:26`, `src/middleware/requireAuth.ts:15`, `src/services/AuthService.ts:26`, `src/lib/utils/hash.ts:8` | Min 64 chars, cryptographically random |
| `JWT_SECRET_PREVIOUS` | Optional | `src/proxy.ts:32`, `src/middleware/requireAuth.ts:21` | Set only during key rotation |
| `CRON_SECRET` | REQUIRED | `src/middleware/cronGuard.ts:9`, `src/lib/utils/cron-guard.ts:5` | Vercel sends as `Authorization: Bearer <value>` |
| `UPSTASH_REDIS_REST_URL` | REQUIRED | `src/lib/redis/client.ts:4` | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | REQUIRED | `src/lib/redis/client.ts:5` | Upstash Redis auth token |
| `FIREBASE_PROJECT_ID` | REQUIRED | `src/lib/firebase/admin.ts:8` | Firebase Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | REQUIRED | `src/lib/firebase/admin.ts:9` | Firebase Admin SDK |
| `FIREBASE_PRIVATE_KEY` | REQUIRED | `src/lib/firebase/admin.ts:10` | Paste with literal `\n` for newlines |
| `BREVO_API_KEY` | REQUIRED | `src/lib/email/brevo.ts:11` | Brevo (formerly Sendinblue) email API |
| `BREVO_SENDER_EMAIL` | REQUIRED | `src/lib/email/brevo.ts:16` | Must be verified sender in Brevo |
| `BREVO_SENDER_NAME` | REQUIRED | `src/lib/email/brevo.ts:17` | Display name for outbound emails |
| `NEXT_PUBLIC_APP_URL` | REQUIRED | `src/services/AuthService.ts:207` | Password reset link base URL (e.g., `https://hrms.company.com`) |
| `ADMIN_EMAIL` | Seed-only | `scripts/seed-admin.ts` | Remove from Vercel after seeding |
| `ADMIN_INITIAL_PASSWORD` | Seed-only | `scripts/seed-admin.ts` | **MUST REMOVE from Vercel after seeding** |
| `NODE_ENV` | Auto-set | `src/app/api/v1/auth/login/route.ts:48` | Vercel sets `production` automatically |
| `MAINTENANCE_MODE` | Optional | `src/proxy.ts:93` | Set to `"true"` to enable maintenance page |
| `JWT_REFRESH_SECRET` | **NOT USED** | `.env.example:7` only | Documented but never read by code; refresh tokens are opaque SHA-256 hashes |
| `SENTRY_DSN` | Recommended | Not yet integrated | Required once H1 (monitoring) is resolved |

**Mobile (build-time dart-define):**

| Variable | Required | Notes |
|----------|----------|-------|
| `API_BASE_URL` | REQUIRED | `--dart-define=API_BASE_URL=https://hrms.company.com` at build time |

---

## MongoDB Setup Requirements

1. **Atlas tier:** M10 minimum for production (dedicated, guaranteed IOPS, no cold starts)
2. **Database name:** Set in `MONGODB_URI` connection string
3. **Network access:** Add Vercel IP ranges or allow `0.0.0.0/0` (acceptable for Atlas with strong credentials)
4. **Automated backup:** Enable in Atlas → Backup → Continuous Cloud Backup
5. **Indexes:** All indexes are defined in Mongoose schemas and will be created on first `mongoose.connect()`. No manual migration needed.
6. **TTL indexes defined** (self-cleaning collections):
   - `DeviceSession.expiresAt` — TTL 0 (at expiry time)
   - `PasswordResetToken.expiresAt` — TTL 0
   - `FcmToken.lastRefreshedAt` — TTL 90 days (`expireAfterSeconds: 7_776_000`)
   - `UsedNonce.usedAt` — TTL 10 minutes (replay prevention)
   - `Notification.createdAt` — TTL 1 year
7. **Seed before first use:** Run `npm run seed:all` with `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` set, then remove those env vars from Vercel

---

## Firebase Setup Requirements

**Admin SDK (backend):**
1. Create Firebase project → Project Settings → Service Accounts → Generate New Private Key
2. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` in Vercel
3. Enable Firebase Cloud Messaging in Firebase Console

**Mobile SDK (Flutter):**
1. Install FlutterFire CLI: `dart pub global activate flutterfire_cli`
2. Run: `flutterfire configure --project=<firebase-project-id>`
3. This generates `apps/mobile/lib/firebase_options.dart` and downloads `google-services.json` / `GoogleService-Info.plist`
4. Add `google-services.json` to `apps/mobile/android/app/`
5. Add `GoogleService-Info.plist` to `apps/mobile/ios/Runner/`
6. Verify `com.google.gms.google-services` plugin applied in `build.gradle.kts` (FlutterFire configure does this)

---

## Monitoring Requirements

The following must be in place before go-live:

| Requirement | Tool | Priority |
|-------------|------|----------|
| Exception tracking | Sentry for Next.js | P0 |
| Uptime monitoring | Vercel / Better Uptime / Statuspage | P0 |
| Error rate alerting | Sentry alert rules (> 1% error rate) | P0 |
| Cron job failure alerting | Sentry or Vercel cron monitoring | P0 |
| MongoDB Atlas alerts | Atlas → Alerts (connections, CPU, disk) | P0 |
| API latency monitoring | Vercel Analytics or Sentry performance | P1 |
| FCM delivery rate | Firebase Console → Cloud Messaging | P1 |

---

## Pre-Deployment Checklist

### Infrastructure
- [ ] MongoDB Atlas M10+ cluster created in target region
- [ ] Atlas automated backup enabled
- [ ] Atlas network access configured (Vercel IPs or 0.0.0.0/0)
- [ ] Upstash Redis instance created in same region as Vercel deployment
- [ ] Firebase project created and FCM enabled
- [ ] Brevo account active, sender domain verified (SPF/DKIM)
- [ ] Vercel project created, linked to repo, domain configured
- [ ] SSL certificate active on production domain (Vercel handles automatically)

### Firebase Mobile Config (resolves C1)
- [ ] `flutterfire configure` run against production Firebase project
- [ ] `apps/mobile/lib/firebase_options.dart` generated and committed
- [ ] `apps/mobile/android/app/google-services.json` placed (gitignore if public repo)
- [ ] `apps/mobile/ios/Runner/GoogleService-Info.plist` placed

### Android Release Signing (resolves C2)
- [ ] Release keystore generated and stored securely (not in git)
- [ ] `apps/mobile/android/key.properties` created (gitignored)
- [ ] `build.gradle.kts` updated with release signing config
- [ ] `flutter build apk --release` produces release-signed APK
- [ ] APK signature verified: `apksigner verify --print-certs app-release.apk`

### Android App Identity (resolves H2)
- [ ] Final `applicationId` chosen and registered in Google Play Console
- [ ] `build.gradle.kts` applicationId and namespace updated
- [ ] `AndroidManifest.xml` `android:label` set to production app name

### Error Monitoring (resolves H1)
- [ ] Sentry Next.js SDK installed and configured
- [ ] `SENTRY_DSN` added to Vercel environment variables
- [ ] Error rate alert configured in Sentry

### Environment Variables
- [ ] `MONGODB_URI` set in Vercel (production environment)
- [ ] `JWT_SECRET` set (min 64 chars, cryptographically random)
- [ ] `JWT_SECRET_PREVIOUS` left empty (only set during rotation events)
- [ ] `CRON_SECRET` set (cryptographically random)
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set
- [ ] `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` set
- [ ] `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` set
- [ ] `NEXT_PUBLIC_APP_URL` set to production URL
- [ ] `NODE_ENV=production` (Vercel sets automatically — verify)
- [ ] `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` set (temporary — remove after seed)
- [ ] `MAINTENANCE_MODE` NOT set (or set to `"false"`)
- [ ] `JWT_REFRESH_SECRET` NOT set (unused by code — omit to avoid ops confusion)

### Database Seeding
- [ ] `npm run seed:settings` run against production DB
- [ ] `npm run seed:admin` run against production DB
- [ ] Admin login tested with seeded credentials
- [ ] `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` removed from Vercel immediately after seeding
- [ ] Admin password changed from initial value

### Mobile Build Verification
- [ ] `flutter analyze` → 0 issues
- [ ] `flutter test` → 97/97 pass
- [ ] Release APK built: `flutter build apk --release --dart-define=API_BASE_URL=https://prod-url`
- [ ] Release APK installed on physical device and tested (not emulator)
- [ ] FCM notification received on physical device
- [ ] Login with registered employee account succeeds on physical device

---

## Deployment Checklist

### Backend Deployment (Vercel)
- [ ] Push to main branch (or deploy via Vercel CLI)
- [ ] Vercel build succeeds (watch for TypeScript errors)
- [ ] Verify build output includes:
  - `ƒ Proxy (Middleware)` — auth middleware active
  - `ƒ /admin/cron/session-auto-close`
  - `ƒ /admin/cron/leave-year-allocation`
  - `ƒ /admin/cron/leave-carryforward-expiry`
- [ ] Smoke test: `GET https://your-domain.com/api/v1/health` → 200
- [ ] Smoke test: `POST /api/v1/auth/login` with admin credentials → 200 + tokens
- [ ] Smoke test: cron endpoint with `Authorization: Bearer <CRON_SECRET>` → 200
- [ ] Admin portal accessible at production URL
- [ ] Admin login works end-to-end in browser

### Mobile Deployment (Google Play)
- [ ] Upload signed AAB to Play Console: `flutter build appbundle --release --dart-define=API_BASE_URL=https://prod-url`
- [ ] Internal testing track: distribute to QA team
- [ ] Complete Play Console store listing (screenshots, description, content rating)
- [ ] Privacy policy URL provided
- [ ] Data safety section completed (location, device ID collection disclosure)
- [ ] Submit for review (production release)

---

## Post-Deployment Checklist

### Immediate (within 1 hour)
- [ ] Sentry: verify errors are being captured (trigger a test error)
- [ ] Atlas: verify connections are being established (Atlas Metrics → Connections)
- [ ] Vercel: verify cron jobs appear in Vercel dashboard → Cron Jobs tab
- [ ] `ADMIN_INITIAL_PASSWORD` confirmed removed from Vercel env vars
- [ ] Admin account: change password from seeded value
- [ ] FCM: send test notification via Firebase Console → Cloud Messaging

### Within 24 hours
- [ ] Monitor Atlas connection pool (should stay below `maxPoolSize: 10` per function)
- [ ] Monitor Sentry for any auth failures or unexpected errors
- [ ] Verify password reset email flow end-to-end (Brevo delivery)
- [ ] Verify cron jobs fired on schedule (check Vercel cron logs)
- [ ] Review audit logs in MongoDB `auditlogs` collection

### Within 1 week
- [ ] Review Upstash rate limiter hit counts (any abuse?)
- [ ] Monitor FCM delivery rate in Firebase Console
- [ ] Check Atlas disk usage (set Atlas alert at 70%)
- [ ] Confirm all active employees can log in and submit attendance

---

## Rollback Checklist

### Backend Rollback (Vercel)
- [ ] Vercel Dashboard → Deployments → select last known-good deployment → Promote to Production
- [ ] Rollback completes in < 30 seconds (Vercel instant promotion)
- [ ] Smoke test `/api/v1/health` on rolled-back deployment
- [ ] If DB schema changed: assess impact (Mongoose handles schema-less MongoDB gracefully; no migration rollback needed for additive changes)

### Mobile Rollback (Google Play)
- [ ] Play Console → Release → Production → rollout percentage to 0% (halt rollout)
- [ ] If full rollout: use Play Console rollback to previous release
- [ ] Notify users via in-app notification if breaking change

### Emergency Procedures
| Scenario | Action |
|----------|--------|
| DB unreachable | Check Atlas status page; verify `MONGODB_URI`; check Atlas IP allowlist |
| All logins fail with AUTH_003 | Verify `JWT_SECRET` env var is set in Vercel production |
| Cron jobs not firing | Check Vercel Dashboard → Cron Jobs; verify `CRON_SECRET` matches |
| FCM notifications silent | Check Firebase Console; verify `FIREBASE_PRIVATE_KEY` newline encoding |
| Rate limiter blocking all requests | Check Upstash Redis; verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` |
| Enable maintenance mode | Set `MAINTENANCE_MODE=true` in Vercel → redeploy |

---

## Recommended Actions by Priority

### P0 — Required Before Any Production Deployment
| # | Action | Resolves |
|---|--------|---------|
| 1 | Run `flutterfire configure`, commit generated files | C1 |
| 2 | Configure release signing keystore for Android | C2 |
| 3 | Set final `applicationId` and `android:label` | H2 |
| 4 | Integrate Sentry Next.js SDK | H1 |
| 5 | Provision all required Vercel env vars | Deployment prerequisite |
| 6 | Create Atlas M10+ cluster, enable backups | Infrastructure prerequisite |

### P1 — Required Before General Availability
| # | Action | Resolves |
|---|--------|---------|
| 7 | Add TTL index + `actorRole`/`actorEmail` to AuditLog | M1 |
| 8 | Add `MAINTENANCE_MODE` to `.env.example` with description | M7 |
| 9 | Remove `JWT_REFRESH_SECRET` from `.env.example` or add clarifying comment | M2 |
| 10 | Enforce `requiresPasswordChange` on app restore | M6 |
| 11 | Add `READ_PHONE_STATE` to AndroidManifest.xml for device fingerprint on Android 26+ | Hardening |

### P2 — Quality Improvements (Post-Launch)
| # | Action | Resolves |
|---|--------|---------|
| 12 | Add API route integration tests | M3 |
| 13 | Implement mobile offline mode with retry queue | M5 |
| 14 | Fix `hashIpAddress` fallback key guard | M4 |
| 15 | Address L1–L8 low findings from Phase 11 | L1–L8 |

---

## Open Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Atlas connection exhaustion (serverless cold starts) | MEDIUM | HIGH | Monitor; set `maxPoolSize: 5` initially; upgrade Atlas tier |
| FCM token staleness (tokens expire after 270 days) | LOW | MEDIUM | TTL index on `FcmToken.lastRefreshedAt` auto-expires; acceptable |
| JWT secret compromise | LOW | CRITICAL | Rotation procedure documented (H3 verified resolved); rotate immediately if compromised |
| Cron double-execution (Vercel retry) | LOW | MEDIUM | `SystemEvent` unique index prevents duplicate processing |
| Rate limiter abuse via IP spoofing | LOW | MEDIUM | `x-forwarded-for` trust chain — acceptable on Vercel (Vercel sets this) |
| Brevo email delivery failure | LOW | MEDIUM | Password reset fails silently (by design — anti-enumeration); monitor Brevo dashboard |
| `ADMIN_INITIAL_PASSWORD` not removed | MEDIUM | HIGH | Operationally critical — add to P1 runbook |

---

## Final Recommendation

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║                           STOP                                       ║
║                                                                      ║
║  CRITICAL FINDINGS: 2                                                ║
║  HIGH FINDINGS:     2                                                ║
║                                                                      ║
║  NOT READY FOR PRODUCTION DEPLOYMENT                                 ║
║  NOT READY FOR MOBILE STORE SUBMISSION                               ║
║                                                                      ║
║  Backend/Admin Portal:  READY FOR INFRASTRUCTURE SETUP              ║
║  Mobile App:            BLOCKED — C1 + C2 + H2                      ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Resolved findings that do NOT block backend deployment:**
- All 4 CRITICAL + 6 HIGH system findings from Phase 12 are verified resolved
- UAT: 77/81 PASS, 0 FAIL — business workflows validated
- Backend API, authentication, authorization, rate limiting, cron jobs: production-ready

**What blocks everything:**
- C1: Firebase config files → mobile app cannot build or use FCM
- C2: Debug signing → Play Store upload rejected
- H1: No error monitoring → production ops is blind
- H2: Placeholder app identity → must be set before Play Console registration

**Once C1, C2, H1, H2 are resolved** and all Pre-Deployment Checklist items are complete:

```
PRODUCTION READY
READY FOR INFRASTRUCTURE SETUP
READY FOR DEPLOYMENT
```

---

*Do not perform deployment. Wait for approval.*

*Production Readiness Review performed: 2026-06-21*
*Review score: 50/100*
*Previous system validation score (Phase 12.2): 84/100*
