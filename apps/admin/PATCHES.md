# PATCHES — every change to a pre-existing file

This document exists so you can review, or reverse, each edit to a file that
already worked. New files are not listed here (they carry no regression risk);
see `CHANGED_FILES.md` for that inventory.

**Zero new npm dependencies.** No `package.json` change is required. The PDF
writer and the Cloudflare R2 SigV4 signer are hand-rolled for exactly this
reason. `exceljs`, already a dependency, is reused for spreadsheet output.

---

## 1. `src/lib/email/brevo.ts` (was ~60 lines, now 143)

**Why:** the original `sendEmail()` accepted a single `to` address only, with no
cc, bcc or attachments. Sending an altered order needs all three.

**What was added:** a new exported `sendTransactionalEmail()`, plus
`EmailProviderError`, `TransactionalAttachment`, `TransactionalEmailOptions`.

**What was NOT changed:** the original `sendEmail()` is byte-identical. Existing
callers (password reset, device requests) are unaffected.

> **Security note worth your attention.** The original threw
> ``new Error(`Brevo error ${res.status}: ${errBody}`)``, which puts raw provider
> output — potentially including recipient addresses — into logs. The new
> function deliberately does **not** echo the response body. I did not change the
> old function's behaviour, so that leak still exists on the password-reset path.
> Flagging it rather than silently fixing it, because it is outside this build's
> boundary.

---

## 2. `src/services/ops/DocumentVaultService.ts` (rewritten, additive API)

**Why — this one fixed a real defect.** The original `devSave()` returned

```
/api/v1/ops/documents/file/{chainId}/{fileName}
```

but **no such route existed anywhere in your tree**. Every document upload
produced a dead link. Confirmed by a full `find app/api -name route.ts` sweep.

**What changed:**
- Bytes now go through `lib/storage`, so the same code path serves the local
  filesystem in dev and Cloudflare R2 in production (`STORAGE_DRIVER` env var;
  default `local` reproduces the old behaviour exactly).
- `storageKey` is persisted so an object can be found independently of its URL.
- Added `getDocument()`, `readDocumentBytes()`, `resolveSignedUrl()`.
- `fileUrl` now points at `/api/v1/ops/documents/{id}`, a route that **does**
  exist and is authenticated.

**Compatibility:** `uploadDocument`, `listDocuments` and `softDeleteDocument`
keep their names and signatures, so existing callers cannot break.

---

## 3. `src/models/ops/ChainDocument.ts` (55 lines, +1 field)

Added one optional field:

```ts
storageKey?: string;
```

**Why this was mandatory:** Mongoose runs in strict mode, so without a schema
entry the `storageKey` written by the vault would have been **silently dropped**,
making every stored file unretrievable. This is the kind of failure that looks
fine until the first download.

Optional, so every existing document still validates.

---

## 4. `src/components/shared/StatusBadge.tsx` (was ~40 lines, now 74)

Added the 22 chain statuses to `variantMap` and `labelMap` (e.g.
`PO_RECEIVED` → "PO Received", `AWAITING_TAX_INVOICE` → "Awaiting Tax Invoice").

Attendance and leave statuses are untouched. Without this, chain statuses would
have rendered as raw upper-case enum names.

---

## 5. `src/components/layout/Sidebar.tsx` (+13 nav entries)

Added `NAV_DESK` entries for the new screens: `/desk/chains`, the seven stage
buckets, `/desk/emails`, `/desk/reports`, `/desk/settings`.

**Untouched:** `NAV_ATTENDANCE`, `NAV_ATTENDANCE_SECONDARY`, the workspace
switcher, the `genesis:workspace` localStorage key, and — importantly — the
`useState(isOnMastersPath)` + pathname-sync `useEffect` from your uncommitted
30.01-K work, which is preserved exactly as uploaded.

---

## 6. `src/validators/ops/chain.ts` (+1 enum member)

Added `'shortSupply'` to the `OpsReportQuerySchema.report` enum so the sixth
report can be requested. Purely additive.

---

## 7. `src/services/ops/ImportEngine.ts` (413 → 664 lines)

**Why:** you asked for bulk Excel import with an in-page preview. The engine
already supported products, canteens and manufacturers, but chain order lines —
the sheet you actually receive from a canteen — threw `OPS_018 not implemented`.

**Added, all appended or branch-local:**

| Addition | Purpose |
| --- | --- |
| `CHAIN_LINES_COLUMN_MAPPING` | Maps `SKU`, `Item`/`Description`, `UOM`, `PackSize`, `PoQty`, `FinalQty`/`AlteredQty`, `VarianceReason`, `VarianceNote`, `Rate`, `GSTRatePercent` |
| `validateChainLineRow()` | Per-row rules: SKU-or-description, qty ≥ 0, variance reason required on any change, reason must be a known value, note required for `OTHER`, rate ≥ 0, GST 0–100 |
| private `replaceChainLines()` | The commit path |
| A `CHAIN_LINES` branch in `commitBatch` | Throws `OPS_058` with a plain-language message when the import is not linked to a chain |

**Safety rules enforced on commit:** refuses `CLOSED`/`CANCELLED` chains
(`OPS_033`); refuses once lines are locked (`OPS_061`); refuses an empty sheet
(`OPS_037`); rejects duplicate SKUs within one sheet; and rejects **products
belonging to a different manufacturer than the chain** (`OPS_024`) — which is the
mistake most likely to occur in real use. All resolution happens before any
write, then lines are replaced and a `LINE_EDITED` event is logged reading
"N line item(s) imported from a spreadsheet, replacing M".

**Untouched:** every existing entity type, `parseExcelBuffer`, `discardBatch`,
the idempotency guard, and the lazy `exceljs` import.

> **Known gap, stated plainly:** the engine now accepts `CHAIN_LINES`, but I have
> not confirmed that `ImportBatch.chainId` exists on your model, and no UI yet
> passes a `chainId` when creating a batch. Until that is wired, a chain-lines
> import will correctly fail with `OPS_058` rather than corrupt anything. Treat
> this as the one deliberately unfinished thread. Listed in `VERIFY.md`.

---

## 8. `src/models/ops/OpsSettings.ts` (new file, one typo fixed post-write)

Not a pre-existing file, but noting a self-caught defect: the default email body
template contained `Dear {{manufacturerContact}],` — a mismatched brace that
would have rendered literally in every outgoing email. Corrected to
`{{manufacturerContact}},`.

---

## How to reverse any single patch

Every modified file is listed with its baseline hash in `BASELINE.sha256`. To
restore one file to its pristine state, take it from your own `src.zip` — that
upload is the reference copy and was never written to.
