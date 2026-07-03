# Phase 15.28 — Local Secret Hygiene Remediation and Rotation Handoff

**Date:** 2026-07-01
**Investigator:** Claude Code
**Scope:** Repository hygiene only — no application code modified, no secrets rotated, no history rewritten.

---

## Executive Summary

Local repository hygiene remediation has been performed:

1. `apps/admin/.env.example` — all real credential values replaced with safe placeholders. No sensitive values remain.
2. `apps/admin/.env.local` — removed from git index (`git rm --cached`). Local file preserved on disk. It will no longer be committed.
3. `apps/admin/.gitignore` — `!.env.local` whitelist removed. `.env.local` and `.env.*.local` are now explicitly ignored.

**This does not remediate the historical secret exposure.** Both files existed in git history before these changes. All real-looking committed secrets must be treated as compromised until rotated. Secret rotation, Vercel env var updates, git history rewrite, and redeployment remain required manual steps.

**Final decision: NOT READY.**

---

## Pre-Change Safety Snapshot

| Check | Result | Risk |
|---|---|---|
| `git status --short` | `.env.local` modified (unstaged), `.env.example` unmodified, `.gitignore` unmodified | No conflicts with allowed files |
| `git ls-files apps/admin/.env.example` | Tracked | File was committed and in git index |
| `git ls-files apps/admin/.env.local` | Tracked | File was committed and in git index — CRITICAL |
| `git check-ignore -v apps/admin/.env.local` | Not ignored | `!.env.local` rule was whitelisting it |
| Unrelated uncommitted changes | `apps/admin/next.config.ts`, `apps/admin/src/proxy.ts`, `apps/mobile/.env.example.json` | Do not conflict with allowed files — left untouched |

---

## Files Modified

| File | Change Type | Description |
|---|---|---|
| `apps/admin/.env.example` | Content replacement | All 12 sensitive values replaced with placeholders |
| `apps/admin/.env.local` | Index removal only | `git rm --cached` — file preserved on disk |
| `apps/admin/.gitignore` | Rule change | Removed `!.env.local`; added `.env.local` and `.env.*.local` explicit ignore rules |
| `docs/50-secret-hygiene-remediation.md` | Created | This document |

**No application code was modified.**

---

## `.env.example` Sanitization

### Before

All 12 sensitive variables contained real-looking non-placeholder values committed since commit `5bf3a15`.

### After

| Variable | Sensitive? | Now Placeholder? | Value Printed? |
|---|:---:|:---:|:---:|
| `MONGODB_URI` | Yes | Yes (`mongodb+srv://<username>:<password>@<cluster>...`) | No |
| `JWT_SECRET` | Yes | Yes (`your-jwt-access-secret-min-64-chars-...`) | No |
| `JWT_REFRESH_SECRET` | Yes | Yes (`your-jwt-refresh-secret-min-64-chars-...`) | No |
| `JWT_ACCESS_EXPIRES_IN` | No | N/A (non-sensitive, preserved) | No |
| `JWT_REFRESH_EXPIRES_IN` | No | N/A (non-sensitive, preserved) | No |
| `JWT_REFRESH_ABSOLUTE_EXPIRES_IN` | No | N/A (non-sensitive, preserved) | No |
| `UPSTASH_REDIS_REST_URL` | Yes | Yes (`https://<your-upstash-redis-name>.upstash.io`) | No |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Yes (`your-upstash-redis-rest-token-here`) | No |
| `FIREBASE_PROJECT_ID` | Yes | Yes (`your-firebase-project-id`) | No |
| `FIREBASE_CLIENT_EMAIL` | Yes | Yes (`firebase-adminsdk-xxxxx@your-firebase-project-id.iam...`) | No |
| `FIREBASE_PRIVATE_KEY` | Yes | Yes (`YOUR_PRIVATE_KEY_CONTENT_HERE` body, no real PEM data) | No |
| `BREVO_API_KEY` | Yes | Yes (`your-brevo-api-key-here`) | No |
| `BREVO_SENDER_EMAIL` | Partial | Yes (`noreply@your-domain.com`) | No |
| `BREVO_SENDER_NAME` | No | N/A (non-sensitive, preserved) | No |
| `SEED_ADMIN_EMAIL` | Partial | Yes (`admin@your-domain.com`) | No |
| `SEED_ADMIN_INITIAL_PASSWORD` | Yes | Yes (`your-secure-seed-admin-password-change-before-production`) | No |
| `CRON_SECRET` | Yes | Yes (`your-cron-secret-min-64-hex-chars-...`) | No |
| `NEXT_PUBLIC_APP_URL` | No | N/A (`https://your-app.vercel.app`) | No |
| `NODE_ENV` | No | N/A (preserved) | No |

**Verification result:** Pattern scan against 15 known real credential patterns returned `PASS` — no real credential fingerprints detected in the sanitized file.

**Important:** If your IDE has `.env.example` open with the old real values, close it without saving, or revert to disk. The file on disk now contains placeholders only. Do not save old IDE buffer contents back.

---

## `.env.local` Tracking Removal

```
git rm --cached -- apps/admin/.env.local
```

| Verification | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Local file still exists | Yes | Yes (5379 bytes at `apps/admin/.env.local`) | PASS |
| `git ls-files apps/admin/.env.local` | Empty (untracked) | Empty | PASS |
| `git status` shows removal | `D  apps/admin/.env.local` | `D  apps/admin/.env.local` | PASS |
| File will be ignored going forward | Yes (after `.gitignore` fix) | Yes | PASS |

The local `.env.local` file on disk was **not deleted**. The developer's working copy is intact. The file will no longer be staged or committed after the `.gitignore` fix is committed.

---

## `.gitignore` Hardening

### Change made in `apps/admin/.gitignore`

**Before:**
```
.env
.env.*
!.env.example
!.env.template
!.env.local
```

**After:**
```
.env
.env.*
.env.local
.env.*.local
!.env.example
!.env.template
```

**Explanation:**
- Removed `!.env.local` — this was explicitly whitelisting the primary local secret file.
- Added `.env.local` explicitly before the negation rules so it is always ignored regardless of `.env.*` ordering.
- Added `.env.*.local` to catch variants like `.env.test.local`, `.env.production.local`.
- `.env.example` and `.env.template` remain explicitly whitelisted (safe — placeholder content only after this phase).

### Post-change verification

| Verification | Expected | Actual | Pass/Fail |
|---|---|---|---|
| `git check-ignore -v apps/admin/.env.local` | `apps/admin/.gitignore:10:.env.local` | `apps/admin/.gitignore:10:.env.local` | PASS |
| `git check-ignore -v apps/admin/.env.example` | Not ignored | Not ignored | PASS |

---

## Optional Template Decision

**Decision: No separate template file created.**

`apps/admin/.env.example` now serves as the setup template with placeholder values. Creating a duplicate `apps/admin/.env.local.example` would add redundancy without benefit. Developers should copy `.env.example` to `.env.local` and fill in real values for local development.

---

## Manual Rotation Requirements

**All secrets below must be treated as compromised.** They were committed to git and pushed to GitHub. Rotation must occur before any production launch.

| Secret Category | Rotation Required | Owner | Priority | Notes |
|---|:---:|---|---|---|
| MongoDB Atlas database user password | Yes | Atlas project owner | **P0** | Rotate via Atlas → Database Access → Edit user → Update password |
| JWT access signing secret | Yes | App developer | **P0** | Generate new 64+ char random string; all active sessions invalidated on rotation |
| JWT refresh signing secret | Yes | App developer | **P0** | Generate separately from access secret; must differ |
| Upstash Redis REST token | Yes | Upstash account owner | **P0** | Reset via Upstash Console → Database → Reset token |
| Upstash Redis REST URL | Yes | Upstash account owner | **P0** | Update if token rotation changes URL |
| Firebase service account private key | Yes | Firebase project owner | **P0** | Firebase Console → Project Settings → Service Accounts → Generate new key; delete old key |
| Firebase client email | Yes | Firebase project owner | **P0** | Tied to service account; rotate by creating new SA or revoking old |
| Brevo API key | Yes | Brevo account owner | **P0** | Brevo → SMTP & API → API Keys → Delete old, generate new |
| Cron secret | Yes | App developer | **P0** | Generate new 64+ hex char random string |
| Seed admin initial password | Yes | App developer | **P0** | Change password for the seed admin account in the running app; then clear from Vercel env |
| Firebase project ID | Verify | Firebase project owner | **P1** | Non-credential but identifies project; assess exposure risk |
| Brevo sender email | Verify | App developer | P3 | Non-secret but identifies sender identity |

**After rotating all P0 secrets:**

1. Update all Vercel environment variables (production + preview) with rotated values.
2. All existing JWT sessions will be automatically invalidated (stateless JWT — old tokens fail signature verification with new secret).
3. If refresh tokens are persisted in Redis or MongoDB, flush the relevant Redis keys or token collection after rotating JWT refresh secret.
4. Redeploy to Vercel after env vars are updated.
5. Run targeted runtime verification (health endpoint, login flow) to confirm connectivity.

---

## Git History Remediation Handoff

**This phase did not rewrite git history.**

The secret-bearing blobs remain accessible at commits `5bf3a15` and `9b941a9` in the full git history. Removing the files from the working tree and index does **not** remove historical blobs.

**History rewrite is required to fully eliminate access to committed secrets via git.**

Owner-controlled options (choose one after rotating all secrets):

### Option A — `git filter-repo` (recommended)

```bash
# Install: pip install git-filter-repo
git filter-repo --path apps/admin/.env.example --invert-paths
git filter-repo --path apps/admin/.env.local --invert-paths
git push origin --force --all
git push origin --force --tags
```

After force-push, all collaborators must re-clone. GitHub may retain cached blobs via raw/blob URLs for a period — contact GitHub Support to expedite purge.

### Option B — BFG Repo-Cleaner

```bash
# Download bfg.jar from rtyley/bfg-repo-cleaner
java -jar bfg.jar --delete-files .env.local
java -jar bfg.jar --delete-files .env.example
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push origin --force --all
```

### Option C — Repository recreation

1. Create new private repository.
2. Export only clean history (exclude secret-bearing commits).
3. Push to new repo.
4. Update all CI/CD integrations, Vercel project link, and collaborator access.

### Option D — Formal risk acceptance

If history rewrite is impractical, the repository owner may formally accept the residual exposure risk in writing, contingent on:
- All P0 secrets rotated.
- Repository confirmed private on GitHub.
- GitHub Advanced Security secret scanning enabled.
- Incident documented.

**Caveats for all options:**
- Force-push disrupts all existing local clones — coordinate with all collaborators.
- GitHub retains PR references, forked content, and cached raw blob URLs even after force-push. Public forks cannot be controlled.
- If the repository was ever public, assume external exposure regardless of history rewrite.

---

## Post-Change Verification

| Verification | Expected | Actual | Pass/Fail |
|---|---|---|---|
| `git status` — `.env.example` | Modified (M) | ` M apps/admin/.env.example` | PASS |
| `git status` — `.env.local` | Staged deletion (D) | `D  apps/admin/.env.local` | PASS |
| `git status` — `.gitignore` | Modified (M) | ` M apps/admin/.gitignore` | PASS |
| `git ls-files apps/admin/.env.local` | Empty | Empty | PASS |
| `git check-ignore -v apps/admin/.env.local` | Ignored by `.gitignore:10` | `apps/admin/.gitignore:10:.env.local` | PASS |
| `git check-ignore -v apps/admin/.env.example` | Not ignored | Not ignored | PASS |
| `.env.local` still exists locally | Yes | Yes (5379 bytes) | PASS |
| Real credential pattern scan on `.env.example` | PASS (0 patterns found) | PASS | PASS |

**Note:** These three changes (`.env.example`, `.env.local` index removal, `.gitignore`) must be committed together as a single hygiene commit. The commit does not introduce new secrets. Until committed, the `.env.local` deletion is staged but `.gitignore` enforcement relies on the working tree state.

---

## Remaining Risks

| Risk | Severity | Status |
|---|---|---|
| Secret blobs in git history (commits `5bf3a15`, `9b941a9`) | CRITICAL | **Unresolved — requires history rewrite** |
| GitHub remote may have served blobs publicly | CRITICAL | **Unknown — repository visibility unverified** |
| All P0 secrets remain active/unrotated | CRITICAL | **Unresolved — manual rotation required** |
| Active sessions signed with leaked JWT secrets | HIGH | **Unresolved — invalidated only after JWT secret rotation** |
| Firebase service account active with leaked private key | CRITICAL | **Unresolved — Firebase key revocation required** |
| Atlas database accessible with leaked credentials | CRITICAL | **Unresolved — Atlas password rotation required** |
| IDE may save old file buffer with real credentials | MEDIUM | **Action required: close `.env.example` in IDE without saving** |

---

## Regression Risk

| Item | Risk | Mitigation |
|---|---|---|
| Committing hygiene changes breaks nothing | None — hygiene files only | Verified: no application code touched |
| `.env.local` removal from index causes dev build failure | Low — file still on disk | File exists locally; `npm run dev` unaffected |
| Future `git add .` re-adds `.env.local` | Prevented after `.gitignore` fix is committed | Commit `.gitignore` change before any future `git add .` |
| IDE auto-saves real credentials back to `.env.example` | Medium | Close `.env.example` in IDE; revert from disk; commit sanitized version immediately |

---

## Production Readiness Impact

This phase removes the forward leakage risk (future accidental commits of `.env.local`) and eliminates real values from the `.env.example` template. It does **not** resolve:

- Historical secret exposure in git commits `5bf3a15` and `9b941a9`.
- Active credentials that must be rotated.
- Health-probe defect (`src/app/health/route.ts` — Phase 15.26 finding).
- `proxy.ts` not registered as middleware (Phase 15.26 finding).

Deployment remains blocked on all three Phase 15.26 findings and all P0 secret rotations.

---

## Final Decision

**NOT READY**

Local repository hygiene is complete. The repository will not leak additional secrets via future commits. However, all real-looking secrets committed in git history remain active and must be rotated, Vercel production environment variables must be updated, git history must be cleaned or risk formally accepted, and application code defects (health probe, middleware) must be fixed before any production launch.