# Operations Work Desk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal operations module for Genesis HRMS that tracks the full commission-based order chain from PO receipt through manufacturer dispatch, tax invoice, SO, delivery, and commission receipt.

**Architecture:** Single "Chain" object is the central entity; all documents (PO, altered order, tax invoice, SO, POD) and events attach to it. Status machine enforces valid lifecycle transitions and writes an immutable event log. RBAC extends existing admin/employee roles with super_admin/manager/executive without breaking existing Attendance/HR access.

**Tech Stack:** Next.js 16 app router, Mongoose 8, ExcelJS (existing), Sonner toasts, SWR, React Hook Form + Zod, Tailwind CSS, Brevo email (existing stub), shadcn/ui components (existing).

## Global Constraints

- All new routes under `/desk/**`. Existing Attendance/HR routes (`/dashboard`, `/employees`, `/attendance`, `/leave`, `/regularization`, `/payroll`, `/reports`, `/settings`, `/notifications`, `/audit-logs`) must not move or change URL.
- All new API routes under `/api/v1/ops/**`.
- No new npm packages unless strictly necessary and approved.
- All monetary values stored as numbers; always round via `round2()` from `@lib/utils/money`.
- No hardcoded GST rates or tax computations. Store rates as data; compute line totals only from stored rate fields.
- The document sent to manufacturer is named **"Order Confirmation / Indent"** in code and UI (legal name TBD — see open questions).
- No bulk finalize. No destructive data mutation.
- All new API routes must call `getAuthUser` → role check via `assertRole` or `assertWorkDeskAccess` → service.
- Client-side role checks are supplementary only; server always enforces.
- `can()` helper in `@lib/permissions/can` is source of truth for permission logic.
- `chainScopeFilter()` must be applied on all list queries for executive/employee roles.
- Skeleton rule: never place `<TableSkeleton>` outside a `<table>` element. Use `<Skeleton>` divs instead for non-table loading states.

---

## Domain Model Reference

### Collections (all additive, no existing collections modified)

| Collection | Key Fields | Key Indexes |
|---|---|---|
| Counter | key, seq | key (unique) |
| Canteen | code, name, type, parentCanteenId | code (unique), type+isActive |
| OpsAddress | ownerType, ownerId, addressType | ownerType+ownerId+isActive |
| Manufacturer | code, name, primaryEmail | code (unique), isActive |
| Product | sku, name, manufacturerId | sku (unique), manufacturerId+isActive |
| PriceList | manufacturerId, canteenId, effectiveFrom | manufacturerId+isActive |
| CommissionRule | scope, type, value, effectiveFrom | scope+isActive |
| Chain | chainNumber, status, canteenId, manufacturerId, assignedTo | chainNumber (unique), status+createdAt, assignedTo+status |
| ChainLineItem | chainId, productId, originalQty, alteredQty | chainId+sortOrder |
| ChainDocument | chainId, docType, fileUrl, version | chainId+docType+isDeleted |
| ChainEvent | chainId, eventType, actorUserId | chainId+createdAt |
| EmailLog | chainId, status, toEmails | chainId+createdAt, status+createdAt |
| EmailTemplate | key, scope | key, scope+isActive |
| ImportBatch | entityType, status, createdBy | entityType+createdAt, status |

### Chain Status Machine

```
PO_RECEIVED → UNDER_REVIEW → ALTERED → PENDING_INTERNAL_APPROVAL
→ SENT_TO_MANUFACTURER → AWAITING_TAX_INVOICE → TAX_INVOICE_RECEIVED
→ UPLOADED_ON_PORTAL → PORTAL_APPROVED → SO_RECEIVED → IN_TRANSIT
→ DELIVERED → PAYMENT_PENDING → PAYMENT_RECEIVED → COMMISSION_RAISED
→ COMMISSION_RECEIVED → CLOSED

Side states (reachable from most states):
  ON_HOLD, CANCELLED, REJECTED_ON_PORTAL, SHORT_SUPPLIED, PARTIALLY_DELIVERED
```

Every transition calls `transitionChain()` which saves the new status and writes a `ChainEvent` of type `STATUS_CHANGE`.

### Chain Number Format

`GEN/{FY}/{5-digit-seq}` e.g. `GEN/25-26/00042`

- FY = Indian fiscal year derived from `Asia/Kolkata` date
- Atomic via MongoDB `findOneAndUpdate $inc` on Counter collection
- Counter key: `chain:{FY}` e.g. `chain:25-26`

### RBAC Matrix

| Permission | super_admin | admin | manager | executive | employee |
|---|:---:|:---:|:---:|:---:|:---:|
| chain:view | ✓ | ✓ | ✓ | ✓ | ✓ |
| chain:create | ✓ | ✓ | ✓ | ✓ | — |
| chain:edit | ✓ | ✓ | ✓ | ✓ | — |
| chain:approve | ✓ | ✓ | ✓ | — | — |
| chain:cancel | ✓ | ✓ | ✓ | — | — |
| chain:assign | ✓ | ✓ | ✓ | — | — |
| chain:viewAll | ✓ | ✓ | ✓ | — | — |
| master:view | ✓ | ✓ | ✓ | ✓ | ✓ |
| master:edit | ✓ | ✓ | ✓ | — | — |
| email:send | ✓ | ✓ | ✓ | ✓ | — |
| report:view | ✓ | ✓ | ✓ | — | — |
| attendance:admin | ✓ | ✓ | — | — | — |
| settings:edit | ✓ | ✓ | — | — | — |

**Scope filtering:** executive and employee roles see only chains where `assignedTo === userId`. Enforced server-side via `chainScopeFilter()`.

**Workspace visibility:**
- Work Desk: all roles
- Attendance / HR: admin and super_admin only (sidebar switcher hidden for others)

### Navigation Map

```
/desk                               Work Desk dashboard
/desk/chains                        Chain list (filterable)
/desk/chains/[id]                   Chain detail + timeline
/desk/purchase-orders               PO upload / import
/desk/tax-invoices                  Tax invoice upload
/desk/sales-orders                  SO tracking
/desk/transit                       Transit + delivery
/desk/payments                      Payments + commission
/desk/emails                        Email outbox
/desk/import                        Bulk Excel import
/desk/reports                       Operations reports
/desk/masters/canteens
/desk/masters/manufacturers
/desk/masters/products
/desk/masters/addresses
/desk/masters/price-lists
/desk/masters/commission-rules

(All existing Attendance/HR routes unchanged)
```

---

## Phase Roadmap

### Phase 30.01 — Master Data CRUD

**Scope:** Full CRUD APIs and list/form pages for Canteen, Manufacturer, Product, OpsAddress, PriceList, CommissionRule. Excel bulk import for Product and Canteen. Canteen hierarchy (main → subsidiary). Manufacturer portal reference.

**APIs to build:**
- `GET/POST /api/v1/ops/canteens`
- `GET/PUT/DELETE /api/v1/ops/canteens/[id]`
- `GET/POST /api/v1/ops/manufacturers`
- `GET/PUT /api/v1/ops/manufacturers/[id]`
- `GET/POST /api/v1/ops/products`
- `GET/PUT /api/v1/ops/products/[id]`
- `GET/POST /api/v1/ops/addresses`
- `GET/PUT/DELETE /api/v1/ops/addresses/[id]`
- `GET/POST /api/v1/ops/price-lists`
- `GET/PUT /api/v1/ops/price-lists/[id]`
- `GET/POST /api/v1/ops/commission-rules`
- `GET/PUT /api/v1/ops/commission-rules/[id]`
- `POST /api/v1/ops/import/preview` (parse Excel, return preview rows)
- `POST /api/v1/ops/import/commit` (commit a previewed batch)

**Acceptance criteria:**
- All master list pages replace ComingSoonCard with real data table + create/edit form.
- Canteen hierarchy (subsidiary → main) visible in canteen list.
- Product import: upload Excel → preview with row-level errors → commit.
- All new routes require authentication; master:edit requires manager+.

---

### Phase 30.02 — Chain Creation & PO Import

**Scope:** Create a new Chain from uploaded PO. Import PO line items from Excel. Chain number auto-generated. Initial status `PO_RECEIVED`. Assign chain to a user.

**APIs to build:**
- `GET/POST /api/v1/ops/chains`
- `GET /api/v1/ops/chains/[id]`
- `PUT /api/v1/ops/chains/[id]` (header fields only; line items via separate endpoint)
- `GET/POST /api/v1/ops/chains/[id]/lines`
- `PUT /api/v1/ops/chains/[id]/lines/[lineId]`
- `DELETE /api/v1/ops/chains/[id]/lines/[lineId]`
- `POST /api/v1/ops/chains/[id]/assign`
- `POST /api/v1/ops/chains/[id]/import-lines` (Excel PO lines import into existing chain)

**UI:**
- `/desk/chains` — filterable table with status badge, canteen, manufacturer, assigned-to chip
- `/desk/purchase-orders` — upload PO file, start chain wizard
- Chain create form: canteen selector, manufacturer selector, ship-to/bill-to address selector, source PO number/date
- Line item editor: inline qty edit, variance reason dropdown, rate entry, auto-computed totals

**Acceptance criteria:**
- Chain number `GEN/25-26/NNNNN` generated atomically.
- PO lines editable inline with originalQty vs alteredQty diff highlighted.
- Variance reason required when alteredQty ≠ originalQty.
- Executive scope filter: list only shows chains assigned to self.

---

### Phase 30.03 — Chain Detail View & Status Transitions

**Scope:** Full chain detail page with: header info, status badge, timeline (ChainEvent list), line items table, documents panel, assignment history, action buttons for valid next statuses.

**APIs:**
- `GET /api/v1/ops/chains/[id]/events`
- `POST /api/v1/ops/chains/[id]/transition` (body: `{ toStatus, message }`)
- `POST /api/v1/ops/chains/[id]/hold` (body: `{ reason }`)
- `POST /api/v1/ops/chains/[id]/cancel` (body: `{ reason }`)

**UI:**
- `/desk/chains/[id]` — full detail page
- Status pill + action menu showing only allowed transitions for current user's role
- Immutable event timeline (most recent first)
- Documents panel with upload button (links to Phase 30.05 vault)
- Assignment card showing current assignee + handover history

**Acceptance criteria:**
- `canTransition()` guard enforced server-side; invalid transition returns 422.
- Every status change writes a ChainEvent visible in timeline.
- ON_HOLD and CANCELLED transitions available from most states; confirmed via UI guard.

---

### Phase 30.04 — Email Draft & Send

**Scope:** Compose email to manufacturer with Order Confirmation / Indent attached (PDF or Excel). Show draft preview in UI before sending. Email sent via Brevo. EmailLog records every send.

**APIs:**
- `POST /api/v1/ops/chains/[id]/email/draft` → returns rendered HTML preview
- `POST /api/v1/ops/chains/[id]/email/send` (sends via Brevo, logs in EmailLog, writes ChainEvent)
- `GET /api/v1/ops/emails` — list all email logs

**Document generation:**
- Excel: reuse exceljs pattern from payroll export
- PDF: use a lightweight HTML-to-PDF approach (e.g. html-to-pdf via puppeteer or a simple PDF library — evaluate in phase, no new dep assumed now)

**UI:**
- `/desk/emails` — email outbox list with status badges
- `/desk/chains/[id]` — "Send to Manufacturer" button → opens compose drawer
- Compose drawer: to/cc fields (pre-filled from manufacturer), subject, body, format selector (PDF/Excel), preview button
- Preview modal shows rendered email HTML before final send

**Open question:** Does the Order Confirmation / Indent need a GST-compliant document header? Confirm with CA before final format.

**Acceptance criteria:**
- Draft preview shown before any email is sent.
- EmailLog entry with status `sent` or `failed` after attempt.
- ChainEvent of type `EMAIL_SENT` written.
- Error message (sanitized) stored in EmailLog.errorMessage on failure.

---

### Phase 30.05 — Document Vault & Tax Invoice

**Scope:** Upload, list, and version chain documents. Tax invoice upload triggers status transition to `TAX_INVOICE_RECEIVED`. Portal upload tracking.

**APIs:**
- `POST /api/v1/ops/chains/[id]/documents` (multipart upload)
- `GET /api/v1/ops/chains/[id]/documents`
- `DELETE /api/v1/ops/chains/[id]/documents/[docId]` (soft delete)
- `GET /api/v1/ops/documents/file/[chainId]/[fileName]` (dev file serving)

**Production adapter TODO:** Replace `devSave()` in `DocumentVaultService` with object-storage adapter. Add env var `OPS_STORAGE_BUCKET` at that time.

**UI:**
- Documents panel in chain detail (already shell exists)
- Upload modal: docType selector, file picker, notes
- Tax invoice upload: auto-suggests `TAX_INVOICE` type; prompts to record invoice number/date/value; transitions chain to `TAX_INVOICE_RECEIVED`

**Acceptance criteria:**
- Documents list shows version number, uploaded-by, size.
- Tax invoice upload triggers status transition and writes ChainEvent.
- Soft delete preserves document record in DB.

---

### Phase 30.06 — Sales Order & Portal Tracking

**Scope:** Record SO number/date after portal approval. Track portal upload status and portal approval. Mark delivery address confirmed.

**APIs:**
- `PUT /api/v1/ops/chains/[id]/portal` (portalUploadedAt, portalApprovedAt)
- `PUT /api/v1/ops/chains/[id]/so` (soNumber, soDate)

**UI:**
- `/desk/sales-orders` — list chains in `SO_RECEIVED` / `IN_TRANSIT` / `DELIVERED` status
- In chain detail: SO section with SO number, SO date, portal status indicators

**Acceptance criteria:**
- Chain transitions `UPLOADED_ON_PORTAL → PORTAL_APPROVED → SO_RECEIVED` accessible from UI.
- REJECTED_ON_PORTAL transition available with reason field.

---

### Phase 30.07 — Transit & Delivery

**Scope:** Record dispatch details (transporter, LR number, e-way bill, expected delivery). Mark delivered. Upload POD. Handle short supply and partial delivery.

**APIs:**
- `PUT /api/v1/ops/chains/[id]/dispatch`
- `POST /api/v1/ops/chains/[id]/delivered` (deliveredAt, uploads POD)
- `POST /api/v1/ops/chains/[id]/short-supplied`

**UI:**
- `/desk/transit` — list chains in `IN_TRANSIT` / `PARTIALLY_DELIVERED` / `SHORT_SUPPLIED`
- Transit detail card in chain detail
- Delivery confirmation form with POD upload

**Open question:** Does partial delivery create a split chain, or stay on the same chain with a `PARTIALLY_DELIVERED` status and multiple delivery events? (Operator confirmation needed.)

**Acceptance criteria:**
- `IN_TRANSIT` status requires transporter + LR number.
- POD document stored in ChainDocument with type `LR_POD`.
- `SHORT_SUPPLIED` records shortfall qty per line item.

---

### Phase 30.08 — Payments & Commission

**Scope:** Track canteen payment to manufacturer. Compute commission from rule snapshot. Raise commission invoice. Track commission receipt.

**APIs:**
- `PUT /api/v1/ops/chains/[id]/payment` (canteenPayment fields)
- `PUT /api/v1/ops/chains/[id]/commission` (commission fields)
- `GET /api/v1/ops/commission-summary` (summary across chains)

**Commission computation:**
- Fetch active CommissionRule for (manufacturer, product, or canteen) at chain date.
- Apply formula: percentage of alteredOrderValue, or perUnit × total qty, or flat fee.
- Store computed amount as snapshot on chain — never recompute from live rule after storage.

**Open question:** Does the commission invoice issued to the manufacturer attract GST? What is the correct HSN/SAC code? Confirm with CA before Phase 30.08.

**UI:**
- `/desk/payments` — list chains in `PAYMENT_PENDING` / `PAYMENT_RECEIVED` / `COMMISSION_RAISED` / `COMMISSION_RECEIVED`
- `/desk/masters/commission-rules` — live CRUD (implements ComingSoonCard from Phase 30.00)

**Acceptance criteria:**
- Commission computed amount stored on chain at time of calculation.
- `COMMISSION_RECEIVED → CLOSED` transition marks chain complete.
- Commission summary shows total receivable vs received per manufacturer per period.

---

### Phase 30.09 — Reports

**Scope:** Operations reporting: chain summary, commission earned, manufacturer-wise volume, canteen-wise history, open chains ageing.

**APIs:**
- `GET /api/v1/ops/reports/chains-summary`
- `GET /api/v1/ops/reports/commission`
- `GET /api/v1/ops/reports/manufacturer-volume`

**UI:**
- `/desk/reports` — report cards with date range filters and export to Excel

**Acceptance criteria:**
- All report queries filtered by `can(role, 'report:view')`.
- Excel export via existing exceljs pattern.
- Date range defaults to current fiscal year.

---

### Phase 30.10 — Hardening, Audit Trail & Production Readiness

**Scope:** AuditLog entries for all Chain mutations. Rate limiting on import endpoint. Search/filter improvements. Work Desk dashboard KPIs. Performance: add missing indexes, pagination on all list endpoints. Document vault production adapter swap. Mobile notification stubs for chain assignments (future).

**Open questions to resolve before 30.10:**
1. Legal name of "Order Confirmation / Indent" — confirm with CA.
2. Whether commission invoice needs GST treatment — confirm with CA.
3. Partial delivery: split chain or single chain with multiple delivery events.
4. Document retention policy: how long to keep uploaded files.
5. Whether non-admin mobile employees should ever see Work Desk in the mobile app.

---

## Open Questions (Require Operator or CA Confirmation)

| # | Question | Impact | Phase |
|---|---|---|---|
| 1 | Legal name of the document sent to manufacturer after altering quantities. Currently: "Order Confirmation / Indent". | Document header, email subject, PDF/Excel title. | 30.04 |
| 2 | Does the commission invoice issued to manufacturer attract GST? What is the SAC/HSN code? | Phase 30.08 commission invoice generation. Cannot add GST line without CA confirmation. | 30.08 |
| 3 | Partial delivery: does it create a new child chain, or does it stay on the same chain as `PARTIALLY_DELIVERED`? | Chain model, delivery API, payment tracking. | 30.07 |
| 4 | Document retention policy: how long to retain uploaded files (PO, tax invoices, PODs)? | Production storage adapter, cleanup cron. | 30.10 |
| 5 | Should the mobile app (Flutter) ever show Work Desk screens? | Mobile navigation and API exposure scope. | Future |
| 6 | Is GSTIN mandatory for all canteens and manufacturers, or optional? | Validation on master data create/edit. | 30.01 |

---

## API Route Inventory (All Phases)

All routes require authentication. Role requirements noted.

```
# Masters (Phase 30.01)
GET    /api/v1/ops/canteens                   master:view
POST   /api/v1/ops/canteens                   master:edit
GET    /api/v1/ops/canteens/[id]              master:view
PUT    /api/v1/ops/canteens/[id]              master:edit
GET    /api/v1/ops/manufacturers              master:view
POST   /api/v1/ops/manufacturers              master:edit
GET    /api/v1/ops/manufacturers/[id]         master:view
PUT    /api/v1/ops/manufacturers/[id]         master:edit
GET    /api/v1/ops/products                   master:view
POST   /api/v1/ops/products                   master:edit
GET    /api/v1/ops/products/[id]              master:view
PUT    /api/v1/ops/products/[id]              master:edit
GET    /api/v1/ops/addresses                  master:view
POST   /api/v1/ops/addresses                  master:edit
PUT    /api/v1/ops/addresses/[id]             master:edit
DELETE /api/v1/ops/addresses/[id]             master:edit
GET    /api/v1/ops/price-lists                master:view
POST   /api/v1/ops/price-lists                master:edit
PUT    /api/v1/ops/price-lists/[id]           master:edit
GET    /api/v1/ops/commission-rules           master:view
POST   /api/v1/ops/commission-rules           master:edit
PUT    /api/v1/ops/commission-rules/[id]      master:edit

# Import (Phase 30.01)
POST   /api/v1/ops/import/preview             chain:create
POST   /api/v1/ops/import/commit              chain:create

# Chains (Phase 30.02 onward)
GET    /api/v1/ops/chains                     chain:view (scoped)
POST   /api/v1/ops/chains                     chain:create
GET    /api/v1/ops/chains/[id]                chain:view (scoped)
PUT    /api/v1/ops/chains/[id]                chain:edit
GET    /api/v1/ops/chains/[id]/lines          chain:view
POST   /api/v1/ops/chains/[id]/lines          chain:edit
PUT    /api/v1/ops/chains/[id]/lines/[lid]    chain:edit
DELETE /api/v1/ops/chains/[id]/lines/[lid]    chain:edit
POST   /api/v1/ops/chains/[id]/import-lines   chain:edit
POST   /api/v1/ops/chains/[id]/assign         chain:assign
GET    /api/v1/ops/chains/[id]/events         chain:view
POST   /api/v1/ops/chains/[id]/transition     chain:edit
POST   /api/v1/ops/chains/[id]/hold           chain:cancel
POST   /api/v1/ops/chains/[id]/cancel         chain:cancel

# Documents (Phase 30.05)
GET    /api/v1/ops/chains/[id]/documents      chain:view
POST   /api/v1/ops/chains/[id]/documents      chain:edit
DELETE /api/v1/ops/chains/[id]/documents/[d]  chain:edit
GET    /api/v1/ops/documents/file/[cid]/[f]   chain:view

# Email (Phase 30.04)
POST   /api/v1/ops/chains/[id]/email/draft    email:send
POST   /api/v1/ops/chains/[id]/email/send     email:send
GET    /api/v1/ops/emails                     email:send

# Portal / SO / Transit / Payment (Phases 30.06-30.08)
PUT    /api/v1/ops/chains/[id]/portal         chain:edit
PUT    /api/v1/ops/chains/[id]/so             chain:edit
PUT    /api/v1/ops/chains/[id]/dispatch       chain:edit
POST   /api/v1/ops/chains/[id]/delivered      chain:edit
POST   /api/v1/ops/chains/[id]/short-supplied chain:edit
PUT    /api/v1/ops/chains/[id]/payment        chain:edit
PUT    /api/v1/ops/chains/[id]/commission     chain:approve

# Reports (Phase 30.09)
GET    /api/v1/ops/reports/chains-summary     report:view
GET    /api/v1/ops/reports/commission         report:view
GET    /api/v1/ops/reports/manufacturer-volume report:view
```

---

## Files Created / Modified in Phase 30.00

### New Files
```
apps/admin/src/constants/roles.ts                    (replaced)
apps/admin/src/types/enums.ts                        (extended)
apps/admin/src/types/jwt.ts                          (extended)
apps/admin/src/middleware/requireRole.ts             (replaced)
apps/admin/src/lib/permissions/can.ts                (new)
apps/admin/src/lib/utils/money.ts                    (new)
apps/admin/src/models/ops/Counter.ts                 (new)
apps/admin/src/models/ops/Canteen.ts                 (new)
apps/admin/src/models/ops/OpsAddress.ts              (new)
apps/admin/src/models/ops/Manufacturer.ts            (new)
apps/admin/src/models/ops/Product.ts                 (new)
apps/admin/src/models/ops/PriceList.ts               (new)
apps/admin/src/models/ops/CommissionRule.ts          (new)
apps/admin/src/models/ops/Chain.ts                   (new)
apps/admin/src/models/ops/ChainLineItem.ts           (new)
apps/admin/src/models/ops/ChainDocument.ts           (new)
apps/admin/src/models/ops/ChainEvent.ts              (new)
apps/admin/src/models/ops/EmailLog.ts                (new)
apps/admin/src/models/ops/EmailTemplate.ts           (new)
apps/admin/src/models/ops/ImportBatch.ts             (new)
apps/admin/src/services/ops/ChainNumberService.ts    (new)
apps/admin/src/services/ops/ChainStatusMachine.ts   (new)
apps/admin/src/services/ops/AssignmentService.ts     (new)
apps/admin/src/services/ops/DocumentVaultService.ts (new)
apps/admin/src/services/ops/ImportEngine.ts          (new)
apps/admin/src/components/shared/ComingSoonCard.tsx  (new)
apps/admin/src/app/(portal)/desk/layout.tsx          (new)
apps/admin/src/app/(portal)/desk/page.tsx            (new)
apps/admin/src/app/(portal)/desk/chains/page.tsx     (new)
apps/admin/src/app/(portal)/desk/chains/[id]/page.tsx (new)
apps/admin/src/app/(portal)/desk/purchase-orders/page.tsx (new)
apps/admin/src/app/(portal)/desk/tax-invoices/page.tsx    (new)
apps/admin/src/app/(portal)/desk/sales-orders/page.tsx    (new)
apps/admin/src/app/(portal)/desk/transit/page.tsx         (new)
apps/admin/src/app/(portal)/desk/payments/page.tsx        (new)
apps/admin/src/app/(portal)/desk/emails/page.tsx          (new)
apps/admin/src/app/(portal)/desk/import/page.tsx          (new)
apps/admin/src/app/(portal)/desk/reports/page.tsx         (new)
apps/admin/src/app/(portal)/desk/masters/canteens/page.tsx         (new)
apps/admin/src/app/(portal)/desk/masters/manufacturers/page.tsx    (new)
apps/admin/src/app/(portal)/desk/masters/products/page.tsx         (new)
apps/admin/src/app/(portal)/desk/masters/addresses/page.tsx        (new)
apps/admin/src/app/(portal)/desk/masters/price-lists/page.tsx      (new)
apps/admin/src/app/(portal)/desk/masters/commission-rules/page.tsx (new)
docs/plans/2026-07-25-operations-work-desk.md        (this file)
```

### Modified Files
```
apps/admin/src/models/User.ts               (role enum extended)
apps/admin/src/validators/employee.ts       (role enum extended)
apps/admin/src/components/forms/EmployeeForm.tsx (role options extended)
apps/admin/src/components/layout/Sidebar.tsx     (workspace switcher added)
apps/admin/src/services/LeaveService.ts          (role type widened to UserRole)
apps/admin/src/services/EmployeeService.ts       (role type widened to UserRole)
```
