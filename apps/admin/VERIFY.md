# VERIFY — what I proved, what I could not, and your UAT script

Read the first two sections before you run anything. As your technical lead I am
not going to hand you a build and call it verified when it is not.

---

## 1. What is actually PROVEN

| Check | Result | How |
| --- | --- | --- |
| No existing file deleted | **PASS — 0 deletions** | `sha256sum -c BASELINE.sha256`, 406-file manifest |
| Only intended files touched | **PASS — 14 modified, 45 added, 392 byte-identical** | same manifest |
| Syntax valid across all new/modified code | **PASS — 0 syntax errors in 116 files** | `tsc --noEmit --noResolve` sweep |
| Every internal `@alias` import resolves to a real file | **PASS — 0 unresolved** | full import-graph audit of every `.ts`/`.tsx` |
| Chain detail page structurally sound | **PASS** | 16 dialogs, brace balance 0, paren balance 0, 3 matched layout tags |
| Attendance module untouched | **PASS** | byte-identical hashes |
| Zero new npm dependencies | **PASS** | `package.json` unmodified |

The import-graph audit is the one I would draw your attention to. It caught a
real defect: `AlteredOrderService.ts` and `CommissionService.ts` were being
imported by four files but **did not exist on disk**. Both are now written, to the
exact signatures their callers expect. Without that audit you would have hit an
unresolvable build error on your first `npm run build`.

---

## 2. What is NOT proven — read this

**There has been no full TypeScript typecheck, no `npm run build`, and no runtime
execution of any kind.**

I attempted a real typecheck. `npm install` failed in this sandbox: the process
exited with an empty log and zero packages installed, so the registry is not
actually reachable for downloads. Without `next`, `mongoose`, `zod`, `swr` and
`exceljs` present, `tsc` cannot resolve types, and a typecheck that cannot see
its dependencies proves nothing.

So the honest statement is: **the code is syntactically valid and its internal
references are consistent, but it is type-unverified.** Expect to spend a short
first pass on type errors. Given your methodology, I am not going to dress that
up as anything else.

**Your first command must be:**

```bash
cd apps/admin
npx tsc --noEmit
```

Fix what it reports before running the app. Based on where the risk sits, these
are the specific things I would expect it to flag, in likelihood order:

1. **`opsQuery('workdesk', null, ...)`** — two routes (`ops/users/[id]`,
   `ops/chains/[id]/commission` GET) pass `null` as the schema. If
   `lib/utils/ops-route.ts` types that parameter as a required Zod schema, change
   the signature to accept `null`, or pass `z.object({})`.
2. **`chain.commission` assignment in `CommissionService.raise`** — written through
   an `as unknown as` cast against the `ICommissionRecord` interface. If `tsc`
   objects, widen `ruleSnapshot` on the model to `Schema.Types.Mixed`.
3. **`exceljs` `writeBuffer()`** — returns `Buffer | ArrayBuffer` depending on
   version; the cast may need adjusting.
4. **`lucide-react` icon names** — all must exist in `^0.400.0`: `FilePen`,
   `ReceiptText`, `FileCheck`, `IndianRupee`, `SlidersHorizontal`, `PackageCheck`,
   `UserCog`, `PauseCircle`, `PlayCircle`, `CheckCircle2`, `FileDown`,
   `Paperclip`, `ExternalLink`, `MessageSquare`. Any missing one is a one-word
   swap.
5. **`useAuth()` exposing `user.role`**, and `Button` supporting
   `variant="ghost" | "destructive"` and `size="icon" | "sm"`.
6. **`Column.render` returning `React.ReactNode`** in `ChainBucketPage`.

None of these are design problems; they are the mechanical cost of writing code I
could not compile.

---

## 3. One defect in YOUR existing code you should know about

`lib/utils/api-client.ts` → `apiFetch()` **does not throw on 4xx or 5xx**. It
parses and returns the JSON body regardless of status, throwing only on an
unrecoverable 401. Your existing master pages use:

```ts
try { await apiFetch(...); toast.success('Saved'); } catch { toast.error(...); }
```

which means **a rejected request shows the user a success toast.** On the six
existing master pages that is a cosmetic lie. On Work Desk it would be a
financial one, because these mutations move invoices, payments and commission.

I did **not** change `apiFetch`, because the attendance pages depend on its
current behaviour and that is outside this build's boundary. Instead every new
desk mutation goes through the new `lib/utils/desk-api.ts`, which throws a typed
`DeskApiError` carrying the server's error code. Reads still use `apiFetch`.

**Standing recommendation:** fix `apiFetch` to throw on `!res.ok`, then re-test
the attendance pages. That is a small, high-value piece of debt and it is your
call, not mine.

---

## 4. Setup before UAT

1. Unzip over `apps/admin`. Files land in `src/`; nothing outside `src/` is
   touched except the documentation at the root of this zip.
2. `npx tsc --noEmit` and clear it.
3. **No new env vars are required to start.** Document storage defaults to
   `STORAGE_DRIVER=local`, writing to `.genesis-docs/` under the app. R2 is only
   needed when you choose to switch.
4. `npm run dev`, log in as an admin.
5. **Go to Work Desk → Settings first.** Nothing assumes a legal name or a tax
   rate. Set company identity, document titles and, if applicable, commission
   GST + SAC. Leave GST off until your CA confirms — the commission invoice will
   correctly refuse to raise (`OPS_055`) rather than guess.

---

## 5. UAT script — the full chain

Work through this in order. It follows the exact business flow you described.

### A. Masters and settings
1. Settings: save company identity. Reload — values persist.
2. Set GST applicable **on** with no rate → must be **rejected**. That gate is
   deliberate.
3. Confirm a non-admin sees Settings read-only with an amber banner.

### B. Create the chain (canteen → manufacturer PO)
4. Work Desk → Chains → New Chain. Pick canteen, manufacturer, ship-to, bill-to,
   the canteen's PO number and date. Expect a chain number `GEN/25-26/00001`.
5. Try a ship-to address belonging to a *different* canteen → must be rejected.

### C. Alter the order
6. Open the chain. Add order lines. Change a quantity **without** a variance
   reason → must be rejected.
7. Add the reason, save. Confirm the order value recalculates.
8. Generate the altered order as **PDF**, then as **XLSX**. Both must appear in
   Documents. Open and download each — **confirm the file actually opens.** This
   is the path where a dead link previously existed.

### D. Email the manufacturer
9. Email Altered Order. Confirm the subject/body come from your Settings
   template with placeholders filled.
10. **Confirm the draft is visible and nothing is sent yet** — you asked for this
    explicitly. You should land on the Emails page with the draft listed.
11. Edit the draft, then send. Confirm status moves `draft → sent` and the
    attachment is the *stored* document, not a regenerated copy.

### E. Tax invoice and portal
12. Record the manufacturer's tax invoice. Try recording it *before* the order
    was sent → must be rejected (`OPS_048`).
13. Mark uploaded on portal, then record the portal decision. Try **Reject** on a
    second test chain and confirm it returns to `ALTERED` for rework.

### F. SO, transit, delivery
14. Record the sales order, then dispatch (transporter, LR, e-way bill).
15. Record delivery with a **short** quantity on one line. Confirm the short
    figure appears and the status reflects short supply.
16. Try a delivered quantity **greater** than the agreed quantity → must be
    rejected (`OPS_051`).

### G. Payment and commission
17. Record a **partial** payment → chain must stay payment-pending, because
    commission is earned on a completed collection.
18. Record full payment → `PAYMENT_RECEIVED`.
19. Open the commission preview. Confirm the amount matches your rule
    (percentage / per-unit / flat) and that per-unit uses **delivered** quantities.
20. Raise the commission invoice. Confirm the number format, and that raising a
    **second** time is refused (`OPS_054`).
21. Record the commission receipt, then close the chain.

### H. Cross-cutting
22. **Scope:** log in as an `executive`. Confirm they see only chains assigned to
    them, and cannot assign, cancel or raise commission.
23. **Hold:** put a chain on hold, confirm the banner, release it.
24. **Timeline:** confirm every action above produced a timeline entry with the
    correct actor. This is your audit trail — check it properly.
25. **Reports:** open all six. Pipeline, commission, by manufacturer, by canteen,
    ageing, short supply.
26. **Regression — do not skip:** open Attendance, Payroll, Leave, Employees and
    confirm they behave exactly as before. Then check the sidebar switches
    cleanly between Attendance and Work Desk.

---

## 6. Deliberately unfinished — one thread

**Chain-lines Excel import is engine-complete but not wired.** `ImportEngine`
now validates and commits `CHAIN_LINES`, but no UI passes a `chainId` onto an
`ImportBatch`, and I could not confirm `ImportBatch.chainId` exists on the model.
Until wired, such an import fails cleanly with `OPS_058` and writes nothing. It
cannot corrupt data. Add the chain-scoped upload entry point when you want it.

---

## 7. Still on your desk (unchanged from my last review)

1. **Credential rotation — the only genuine production blocker.** `.env.local`
   was committed in `9b941a9` and `.env.example` carried real values in `5bf3a15`.
   Rotate `JWT_SECRET`, `JWT_REFRESH_SECRET`, the MongoDB password, the Upstash
   token, the Firebase key, `BREVO_API_KEY` and `CRON_SECRET`; remove
   `SEED_ADMIN_INITIAL_PASSWORD`. Operator-only — I will not touch secrets.
2. **`constants/errors.ts` is out of sync with runtime** (`AUTH_006`, `AUTH_010`,
   `ATT_003`, `ATT_004`, and no `OPS_*` entries at all). I left it alone because
   renumbering could break strings the Flutter app switches on. **Your ruling.**
3. **R2 adapter sign-off:** key scheme
   `chains/{FY}/{chainNumber}/{docType}/{timestamp}-{filename}`, private bucket,
   signed URLs, hand-rolled SigV4, no new dependency.
4. **CA confirmations:** the legal document title and commission GST/SAC. Both
   are now editable in Settings, so this no longer blocks the build — only go-live.
5. **On-device retest** of check-out enforcement in `officeIp` mode while off the
   approved network. Still outstanding; `adb devices` has been empty for six phases.
6. **Employee web-portal access** — employees are still blocked from the web
   portal by design. Your Message 15 remark about users logging into the website
   may conflict with that. Unresolved.
