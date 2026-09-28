# BUILD BOUNDARIES — Genesis Work Desk, Phases 30.02–30.10

Read this first. It states what I built, what I deliberately refused to touch,
and how you can verify both claims yourself rather than taking my word for it.

---

## The instruction I worked to

> "Keeping the existing attendance module and everything same, and building rest
> of the automation flow fully... the whole complete project with minimal flow fix
> or exception handling fixes, but no feature must be faulty, it must be built as
> decided."

> "While building make sure you dont cross boundaries and only work on the
> features and pages we have decided, and anything existing must not be removed or
> changed until it's part of the features we want to build."

Everything below follows from those two sentences.

---

## Hard boundaries I did not cross

| Area | Status | Why |
| --- | --- | --- |
| Attendance module | **Untouched, byte-identical** | Explicitly out of scope |
| Geofence / officeIp validation, check-in/out | **Untouched** | Working and runtime-proven; `32913f7` stands |
| `CompanySettings` | **Untouched** | Ops config went into a *separate* `OpsSettings` collection so an ops write can never disturb `attendanceValidationMode` or `allowedOfficeIps` |
| Auth, `proxy.ts`, session/refresh cookies, device fingerprinting | **Untouched** | Security-critical; your uncommitted 30.01-K refresh fix preserved exactly as uploaded |
| `lib/utils/api-client.ts` (`apiFetch`) | **Untouched** | Attendance pages depend on current behaviour — see the defect note in `VERIFY.md` |
| Payroll, leave, regularization, employees, notifications, HR reports | **Untouched** | Out of scope |
| Flutter app (`apps/mobile`) | **Not uploaded, not modified** | Deliberate |
| `constants/errors.ts` | **Left stale on purpose** | Renumbering could break strings the Flutter app switches on. Needs your ruling |
| `.env` / `.env.example` | **Never uploaded, never read, never printed** | Contains real leaked secrets |
| `package.json` | **Unmodified — zero new dependencies** | Hand-rolled PDF writer and SigV4 signer instead |

**Machine-verifiable:** `sha256sum -c BASELINE.sha256` against the 406-file
manifest of your pristine upload shows **392 files byte-identical, 0 deleted**.

---

## What was built

The full chain you described, as one object with a status machine — not separate
PO/SO modules:

> Canteen raises PO → we get read access → we alter the list against
> profit/loss/waste analysis → send to manufacturer → manufacturer returns a tax
> invoice → we upload it to the canteen's portal → approved → goods ship → SO
> received → delivery tracked → canteen pays the manufacturer → we take commission.

| Phase | Feature | State |
| --- | --- | --- |
| 30.02 | Chain CRUD, chain numbering, row-level scope, assignment/handover, hold, cancel | Built |
| 30.03 | Order line editor with variance reasons; lines lock after send | Built |
| 30.04 | Altered order document, PDF **and** XLSX, filed in the vault on generation | Built |
| 30.05 | Document vault on pluggable storage (local ↔ Cloudflare R2), authenticated download | Built |
| 30.06 | Tax invoice → portal upload → portal decision (approve/reject-to-rework) | Built |
| 30.07 | SO, dispatch, delivery, short supply, payment | Built |
| 30.08 | Commission: rule resolution, preview, invoice numbering, raise, receipt | Built |
| 30.09 | Email outbox: draft → **visible review** → send, PDF or XLSX attachment, status | Built |
| 30.10 | Six reports, ops settings screen, bulk chain-lines import engine | Built (import not wired — see below) |

**Totals:** 45 new files, 14 modified, 27 new API routes, ~7,000 lines.

### Your specific requirements, and where each landed

| You asked for | Where it is |
| --- | --- |
| Excel upload + address select + inline quantity change | Chain detail → Order Lines editor; `CHAIN_LINES` import in `ImportEngine` |
| Free-text email field + send button, PDF or Excel choice | Chain detail → Email Altered Order |
| **Draft visible before sending**, mail status visible | Emails page; drafting never sends. Explicitly separated |
| Fixed chain number per chain | `GEN/{FY}/{00001}`, atomic counter |
| Per-user product ownership and handover visibility | `assignedTo` + `handoverHistory`, enforced by `chainScopeFilter` |
| Transit status: goods reached, bill paid | Dispatch/delivery/payment stages + Transit and Payments buckets |
| Commission tracking | Full 30.08 flow with a rule snapshot per invoice |
| Work Desk visible to all; attendance admin-only | Sidebar workspace switch; `proxy.ts` gating unchanged |
| Everything CA-dependent parameterised | Settings page: legal name, document titles, GST + SAC |

---

## Deliberate design decisions you should be aware of

1. **One Chain object with a status machine**, not separate PO/SO modules. A
   chain is one commercial thread; splitting it would let the data and the status
   disagree, which is what makes a pipeline board untrustworthy.
2. **Recording an event and advancing the status always happen together**, for
   the same reason.
3. **Commission is earned on a collected payment, not on delivery.** A partial
   payment deliberately does *not* advance the chain.
4. **Per-unit commission pays on delivered quantities** where known, not on
   ordered quantities. You should not pay commission on undelivered goods.
5. **The applied commission rule is snapshotted onto the chain**, so later edits
   to a master rule cannot retroactively alter a raised invoice.
6. **Nothing assumes a tax rate or a legal name.** The commission invoice refuses
   to raise (`OPS_055`) while GST is marked applicable but rate or SAC is missing.
   That is a feature, not an obstacle.
7. **Generate-and-store is one step.** What gets emailed is the stored document,
   byte-identical to what is on record.
8. **Desk mutations use a client that actually throws on failure**
   (`lib/utils/desk-api.ts`), because `apiFetch` does not. See `VERIFY.md` §3.
9. **No Mongoose transactions.** Your Atlas tier is M0, which does not support
   them. "All-or-nothing" is therefore resolve-everything-then-write; a mid-loop
   failure can leave partial writes. Stated plainly rather than implied.

---

## Honest limitations

- **The code is type-unverified.** `npm install` cannot reach the registry from
  this sandbox, so no full `tsc`, no `npm run build`, no runtime execution. What
  *is* proven: 0 syntax errors across 116 files, and every internal import
  resolves to a real file. Run `npx tsc --noEmit` first. `VERIFY.md` §2 lists the
  six most likely type errors and how to fix each.
- **Chain-lines Excel import is engine-complete but not wired** to a `chainId`.
  It fails cleanly with `OPS_058` and writes nothing until wired.
- **I could not test against your database**, so quantities, rounding and report
  aggregations are logically correct but not empirically confirmed. UAT section G
  targets exactly that.

---

## Files in this zip

```
src/                  the deliverable — unzip over apps/admin
BASELINE.sha256       406 hashes of your pristine upload (boundary proof)
BUILD_BOUNDARIES.md   this file
CHANGED_FILES.md      exact added/modified/deleted inventory
PATCHES.md            every change to a pre-existing file, and how to reverse it
VERIFY.md             what is proven, what is not, and the full UAT script
```

Start with `VERIFY.md`.
