/**
 * Chain lifecycle validators (Phases 30.02–30.08).
 * Mirrors the existing masters validator style: zod schemas exported per action,
 * list schemas extend OpsListQuerySchema so pagination/search behave identically.
 */
import { z } from 'zod';
import { MongoIdSchema, OpsListQuerySchema } from './shared';

export const CHAIN_STATUSES = [
  'PO_RECEIVED', 'UNDER_REVIEW', 'ALTERED', 'PENDING_INTERNAL_APPROVAL',
  'SENT_TO_MANUFACTURER', 'AWAITING_TAX_INVOICE', 'TAX_INVOICE_RECEIVED',
  'UPLOADED_ON_PORTAL', 'PORTAL_APPROVED', 'SO_RECEIVED', 'IN_TRANSIT',
  'DELIVERED', 'PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'COMMISSION_RAISED',
  'COMMISSION_RECEIVED', 'CLOSED', 'ON_HOLD', 'CANCELLED',
  'REJECTED_ON_PORTAL', 'SHORT_SUPPLIED', 'PARTIALLY_DELIVERED',
] as const;

export const VARIANCE_REASONS = [
  'EXPIRY_RISK', 'SLOW_MOVING', 'EXISTING_STOCK', 'WASTAGE_HISTORY',
  'MOQ_ROUNDING', 'MANUFACTURER_UNAVAILABLE', 'CANTEEN_REQUEST', 'OTHER',
] as const;

export const DOC_TYPES = [
  'SOURCE_PO', 'ALTERED_ORDER', 'TAX_INVOICE', 'SALES_ORDER',
  'EWAY_BILL', 'LR_POD', 'PAYMENT_PROOF', 'COMMISSION_INVOICE', 'OTHER',
] as const;

/** Money: non-negative, at most 2 decimal places, bounded to catch paste errors. */
const MoneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(1_000_000_000)
  .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(0)), {
    message: 'At most 2 decimal places allowed',
  });

/** Quantity: non-negative and finite. Zero is legal — it means "drop this line". */
const QtySchema = z.number().finite().nonnegative().max(10_000_000);

const OptionalDateSchema = z.coerce.date().optional();

// ─── Line items ──────────────────────────────────────────────────────────

export const ChainLineInputSchema = z.object({
  productId: MongoIdSchema.optional(),
  rawDescription: z.string().max(300).optional(),
  uom: z.string().min(1).max(20).default('PCS'),
  packSize: z.number().finite().positive().max(1_000_000).optional(),
  originalQty: QtySchema,
  alteredQty: QtySchema,
  varianceReason: z.enum(VARIANCE_REASONS).optional(),
  varianceNote: z.string().max(500).optional(),
  rate: MoneySchema.optional(),
  gstRatePercent: z.number().finite().min(0).max(100).optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
}).refine(
  (l) => Boolean(l.productId) || Boolean(l.rawDescription && l.rawDescription.trim()),
  { message: 'Each line needs either a product or a description', path: ['productId'] },
).refine(
  // A quantity change must be explained. This is the whole point of the
  // altered-order document, so it is enforced rather than left to the UI.
  (l) => l.alteredQty === l.originalQty || Boolean(l.varianceReason),
  { message: 'varianceReason is required when alteredQty differs from originalQty', path: ['varianceReason'] },
).refine(
  (l) => l.varianceReason !== 'OTHER' || Boolean(l.varianceNote && l.varianceNote.trim()),
  { message: 'varianceNote is required when varianceReason is OTHER', path: ['varianceNote'] },
);

export const ReplaceChainLinesSchema = z.object({
  lines: z.array(ChainLineInputSchema).min(1, 'At least one line item is required').max(500),
});

// ─── Chain create / update / list ─────────────────────────────────────────

export const CreateChainSchema = z.object({
  canteenId: MongoIdSchema,
  manufacturerId: MongoIdSchema,
  /** Set when the PO came from a subsidiary but bills to its parent. */
  originCanteenId: MongoIdSchema.optional(),
  shipToAddressId: MongoIdSchema.optional(),
  billToAddressId: MongoIdSchema.optional(),
  sourcePoNumber: z.string().trim().max(60).optional(),
  sourcePoDate: OptionalDateSchema,
  assignedTo: MongoIdSchema.optional(),
  lines: z.array(ChainLineInputSchema).max(500).optional(),
});

export const UpdateChainSchema = z.object({
  shipToAddressId: MongoIdSchema.optional(),
  billToAddressId: MongoIdSchema.optional(),
  sourcePoNumber: z.string().trim().max(60).optional(),
  sourcePoDate: OptionalDateSchema,
  originCanteenId: MongoIdSchema.optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const ListChainsSchema = OpsListQuerySchema.extend({
  status: z.enum(CHAIN_STATUSES).optional(),
  canteenId: MongoIdSchema.optional(),
  manufacturerId: MongoIdSchema.optional(),
  assignedTo: MongoIdSchema.optional(),
  /** Convenience buckets used by the PO/Invoice/SO/Transit/Payment inbox pages. */
  bucket: z.enum(['po', 'altered', 'taxInvoice', 'portal', 'so', 'transit', 'payment', 'commission', 'open', 'closed']).optional(),
  onHold: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  /** Server-side filter for pickers (e.g. the chain-lines import target): only chains whose
   * lines can still be replaced. Mirrors ChainService.linesEditable. */
  linesEditable: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  fromDate: OptionalDateSchema,
  toDate: OptionalDateSchema,
});

export const ChainStatusUpdateSchema = z.object({
  toStatus: z.enum(CHAIN_STATUSES),
  message: z.string().max(500).optional(),
});

export const AssignChainSchema = z.object({
  toUserId: MongoIdSchema,
  reason: z.string().max(300).optional(),
});

export const HoldChainSchema = z.object({
  hold: z.boolean(),
  reason: z.string().max(300).optional(),
}).refine((d) => !d.hold || Boolean(d.reason && d.reason.trim()), {
  message: 'A reason is required when placing a chain on hold',
  path: ['reason'],
});

export const CancelChainSchema = z.object({
  reason: z.string().min(3, 'A cancellation reason is required').max(300),
});

export const ChainCommentSchema = z.object({
  message: z.string().min(1).max(1000),
});

// ─── Lifecycle step payloads ─────────────────────────────────────────────

export const RecordTaxInvoiceSchema = z.object({
  taxInvoiceNumber: z.string().min(1).max(60),
  taxInvoiceDate: z.coerce.date(),
  taxInvoiceValue: MoneySchema,
});

export const PortalUploadSchema = z.object({
  portalUploadedAt: z.coerce.date().optional(),
  note: z.string().max(500).optional(),
});

export const PortalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
}).refine((d) => d.decision !== 'rejected' || Boolean(d.note && d.note.trim()), {
  message: 'A note is required when the portal rejects the upload',
  path: ['note'],
});

export const RecordSalesOrderSchema = z.object({
  soNumber: z.string().min(1).max(60),
  soDate: z.coerce.date(),
});

export const RecordDispatchSchema = z.object({
  transporter: z.string().max(120).optional(),
  lrNumber: z.string().max(60).optional(),
  ewayBillNumber: z.string().max(60).optional(),
  dispatchedAt: z.coerce.date(),
  expectedDeliveryAt: OptionalDateSchema,
}).refine(
  (d) => !d.expectedDeliveryAt || d.expectedDeliveryAt >= d.dispatchedAt,
  { message: 'Expected delivery cannot precede dispatch', path: ['expectedDeliveryAt'] },
);

export const RecordDeliverySchema = z.object({
  deliveredAt: z.coerce.date(),
  /** Per-line delivered quantities. Omit a line to mark it fully delivered. */
  lines: z.array(z.object({
    lineId: MongoIdSchema,
    deliveredQty: QtySchema,
  })).max(500).optional(),
  note: z.string().max(500).optional(),
});

export const RecordPaymentSchema = z.object({
  status: z.enum(['pending', 'partial', 'paid']),
  amount: MoneySchema,
  paidAt: OptionalDateSchema,
  referenceNo: z.string().max(80).optional(),
}).refine((d) => d.status === 'pending' || d.amount > 0, {
  message: 'A partial or paid record needs an amount greater than zero',
  path: ['amount'],
}).refine((d) => d.status === 'pending' || Boolean(d.paidAt), {
  message: 'A partial or paid record needs a payment date',
  path: ['paidAt'],
});

export const RaiseCommissionSchema = z.object({
  /** Optional override; when omitted the applicable rule is resolved automatically. */
  overrideAmount: MoneySchema.optional(),
  note: z.string().max(500).optional(),
});

export const ReceiveCommissionSchema = z.object({
  receivedAmount: MoneySchema,
  receivedAt: z.coerce.date(),
  referenceNo: z.string().max(80).optional(),
});

// ─── Documents ─────────────────────────────────────────────────────────

export const ListDocumentsSchema = z.object({
  docType: z.enum(DOC_TYPES).optional(),
});

export const GenerateAlteredOrderSchema = z.object({
  format: z.enum(['pdf', 'xlsx']).default('pdf'),
});

// ─── Email ───────────────────────────────────────────────────────────

/** Free-text recipient list: comma or semicolon separated, each must be a valid email. */
const EmailListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(/[,;]/)))
  .transform((arr) => arr.map((s) => s.trim().toLowerCase()).filter(Boolean))
  .refine(
    (arr) => arr.every((e) => z.string().email().safeParse(e).success),
    { message: 'One or more email addresses are invalid' },
  )
  .refine((arr) => arr.length <= 25, { message: 'At most 25 recipients allowed' });

export const DraftEmailBaseSchema = z.object({
  toEmails: EmailListSchema,
  ccEmails: EmailListSchema.optional(),
  bccEmails: EmailListSchema.optional(),
  subject: z.string().trim().min(1).max(300),
  bodyText: z.string().trim().min(1).max(20000),
  attachDocumentId: MongoIdSchema.optional(),
  attachFormat: z.enum(['pdf', 'xlsx']).optional(),
});

export const DraftEmailSchema = DraftEmailBaseSchema.refine((d) => d.toEmails.length > 0, {
  message: 'At least one recipient email is required',
  path: ['toEmails'],
});

export const UpdateDraftEmailSchema = DraftEmailBaseSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);

// POST /ops/emails needs chainId alongside the draft fields. Extend the base
// object (not DraftEmailSchema, which is already a ZodEffects and has no
// .extend()), then reapply the same "at least one recipient" refinement.
export const CreateDraftEmailSchema = DraftEmailBaseSchema.extend({
  chainId: MongoIdSchema,
}).refine((d) => d.toEmails.length > 0, {
  message: 'At least one recipient email is required',
  path: ['toEmails'],
});

export const ListEmailsSchema = OpsListQuerySchema.extend({
  status: z.enum(['draft', 'queued', 'sent', 'failed', 'bounced']).optional(),
  chainId: MongoIdSchema.optional(),
});

// ─── Ops settings ─────────────────────────────────────────────────────

export const UpdateOpsSettingsSchema = z.object({
  documentTitles: z.object({
    alteredOrderTitle: z.string().min(1).max(160).optional(),
    commissionInvoiceTitle: z.string().min(1).max(160).optional(),
    documentFooterNote: z.string().max(600).optional(),
  }).optional(),
  commissionTax: z.object({
    gstApplicable: z.boolean().optional(),
    gstRatePercent: z.number().finite().min(0).max(100).optional(),
    sacCode: z.string().max(20).optional(),
    invoiceNumberPrefix: z.string().min(1).max(40).optional(),
  }).optional(),
  companyIdentity: z.object({
    legalName: z.string().max(200).optional(),
    gstin: z.string().max(20).optional(),
    addressLines: z.array(z.string().max(200)).max(8).optional(),
    contactEmail: z.string().email().max(255).optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
    contactPhone: z.string().max(20).optional(),
  }).optional(),
  alteredOrderEmailSubject: z.string().min(1).max(300).optional(),
  alteredOrderEmailBody: z.string().min(1).max(20_000).optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

// ─── Reports ──────────────────────────────────────────────────────────

export const OpsReportQuerySchema = z.object({
  report: z.enum(['pipeline', 'commission', 'manufacturer', 'canteen', 'ageing', 'shortSupply']),
  fromDate: OptionalDateSchema,
  toDate: OptionalDateSchema,
  manufacturerId: MongoIdSchema.optional(),
  canteenId: MongoIdSchema.optional(),
});
