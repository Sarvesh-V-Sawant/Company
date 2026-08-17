'use client';
/**
 * Chain detail \u2014 the single place a chain is worked (Phases 30.02\u201330.08).
 *
 * Everything about one canteen order lives here: the header facts, the order
 * lines, the document vault, the lifecycle actions and the full timeline. The
 * stage inbox pages are read-only precisely so there is exactly one screen where
 * a chain can be changed.
 *
 * The action buttons are driven by `allowedTransitions` from the server, so the
 * UI can never offer a step the status machine would reject.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, Save, Upload, FileDown, Mail, PauseCircle, PlayCircle,
  Ban, MessageSquare, Paperclip, ExternalLink, UserCog, ReceiptText, Truck,
  PackageCheck, IndianRupee, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { Textarea } from '@components/ui/textarea';
import { Dialog } from '@components/ui/dialog';
import StatusBadge from '@components/shared/StatusBadge';
import EntityPicker from '@components/shared/EntityPicker';
import { Skeleton } from '@components/ui/skeleton';
import EmptyState from '@components/shared/EmptyState';
import { apiFetch } from '@lib/utils/api-client';
import {
  deskJson, deskUpload, deskDocumentUrl, deskErrorMessage,
} from '@lib/utils/desk-api';

const VARIANCE_REASONS = [
  'EXPIRY_RISK', 'SLOW_MOVING', 'EXISTING_STOCK', 'WASTAGE_HISTORY',
  'MOQ_ROUNDING', 'MANUFACTURER_UNAVAILABLE', 'CANTEEN_REQUEST', 'OTHER',
] as const;

const VARIANCE_LABEL: Record<string, string> = {
  EXPIRY_RISK: 'Expiry risk',
  SLOW_MOVING: 'Slow moving',
  EXISTING_STOCK: 'Existing stock',
  WASTAGE_HISTORY: 'Wastage history',
  MOQ_ROUNDING: 'MOQ rounding',
  MANUFACTURER_UNAVAILABLE: 'Manufacturer unavailable',
  CANTEEN_REQUEST: 'Canteen request',
  OTHER: 'Other',
};

const DOC_TYPES = [
  'SOURCE_PO', 'ALTERED_ORDER', 'TAX_INVOICE', 'SALES_ORDER',
  'EWAY_BILL', 'LR_POD', 'PAYMENT_PROOF', 'COMMISSION_INVOICE', 'OTHER',
] as const;

const DOC_LABEL: Record<string, string> = {
  SOURCE_PO: 'Source PO',
  ALTERED_ORDER: 'Altered order',
  TAX_INVOICE: 'Tax invoice',
  SALES_ORDER: 'Sales order',
  EWAY_BILL: 'E-way bill',
  LR_POD: 'LR / POD',
  PAYMENT_PROOF: 'Payment proof',
  COMMISSION_INVOICE: 'Commission invoice',
  OTHER: 'Other',
};

type Ref = { _id: string; code?: string; name?: string; firstName?: string; lastName?: string; primaryEmail?: string } | string;

interface LineItem {
  _id?: string;
  productId?: { _id: string; sku?: string; name?: string; uom?: string; gstRatePercent?: number } | string;
  rawDescription?: string;
  uom: string;
  packSize?: number;
  originalQty: number;
  alteredQty: number;
  varianceReason?: string;
  varianceNote?: string;
  rate?: number;
  gstRatePercent?: number;
  taxableValue?: number;
  taxAmount?: number;
  lineTotal?: number;
  deliveredQty?: number;
  shortSuppliedQty?: number;
  sortOrder: number;
}

interface ChainEvent {
  _id: string;
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  message?: string;
  actorUserId?: Ref;
  createdAt: string;
}

interface ChainDetail {
  _id: string;
  chainNumber: string;
  status: string;
  canteenId?: Ref;
  originCanteenId?: Ref;
  manufacturerId?: Ref;
  shipToAddressId?: { _id: string; label?: string; line1?: string; city?: string } | string;
  billToAddressId?: { _id: string; label?: string; line1?: string; city?: string } | string;
  assignedTo?: Ref;
  sourcePoNumber?: string;
  sourcePoDate?: string;
  originalOrderValue?: number;
  alteredOrderValue?: number;
  taxInvoiceNumber?: string;
  taxInvoiceDate?: string;
  taxInvoiceValue?: number;
  portalUploadedAt?: string;
  portalApprovedAt?: string;
  soNumber?: string;
  soDate?: string;
  dispatch?: {
    transporter?: string; lrNumber?: string; ewayBillNumber?: string;
    dispatchedAt?: string; expectedDeliveryAt?: string;
  };
  deliveredAt?: string;
  canteenPayment?: { status?: string; amount?: number; paidAt?: string; referenceNo?: string };
  commission?: {
    computedAmount?: number; invoiceNumber?: string;
    raisedAt?: string; receivedAt?: string; receivedAmount?: number;
  };
  isOnHold?: boolean;
  holdReason?: string;
  cancelReason?: string;
  createdAt: string;
  lines: LineItem[];
  events: ChainEvent[];
  totals: { taxableValue: number; taxAmount: number; lineTotal: number };
  allowedTransitions: string[];
  linesEditable: boolean;
}

interface DocRow {
  _id: string;
  docType: string;
  fileName: string;
  fileUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  version: number;
  uploadedAt: string;
}

type LineDraft = {
  key: string;
  id?: string;
  productId: string;
  productLabel: string;
  rawDescription: string;
  uom: string;
  originalQty: string;
  alteredQty: string;
  varianceReason: string;
  varianceNote: string;
  rate: string;
  gstRatePercent: string;
};

type ActionKey =
  | null | 'status' | 'assign' | 'hold' | 'cancel' | 'comment' | 'taxInvoice'
  | 'portal' | 'portalDecision' | 'salesOrder' | 'dispatch' | 'delivery'
  | 'payment' | 'commissionRaise' | 'commissionReceive' | 'email' | 'upload';

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

function refName(ref: Ref | undefined, fallback = '\u2014') {
  if (!ref) return fallback;
  if (typeof ref === 'string') return fallback;
  if (ref.firstName || ref.lastName) return `${ref.firstName ?? ''} ${ref.lastName ?? ''}`.trim();
  if (ref.code && ref.name) return `${ref.code} \u2013 ${ref.name}`;
  return ref.name ?? fallback;
}

function addressText(ref: ChainDetail['shipToAddressId']) {
  if (!ref || typeof ref === 'string') return '\u2014';
  return [ref.label, ref.line1, ref.city].filter(Boolean).join(', ') || '\u2014';
}

function money(v?: number) {
  if (v === undefined || v === null) return '\u2014';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d?: string) {
  if (!d) return '\u2014';
  try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; }
}

function fmtDateTime(d?: string) {
  if (!d) return '\u2014';
  try { return format(new Date(d), 'dd MMM yyyy, HH:mm'); } catch { return d; }
}

function statusLabel(s: string) {
  return s.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

function lineToDraft(l: LineItem): LineDraft {
  const product = typeof l.productId === 'object' && l.productId ? l.productId : null;
  return {
    key: nextKey(),
    id: l._id,
    productId: product?._id ?? (typeof l.productId === 'string' ? l.productId : ''),
    productLabel: product ? `${product.sku ?? ''} \u2014 ${product.name ?? ''}`.trim() : '',
    rawDescription: l.rawDescription ?? '',
    uom: l.uom ?? 'PCS',
    originalQty: String(l.originalQty ?? 0),
    alteredQty: String(l.alteredQty ?? 0),
    varianceReason: l.varianceReason ?? '',
    varianceNote: l.varianceNote ?? '',
    rate: l.rate === undefined || l.rate === null ? '' : String(l.rate),
    gstRatePercent:
      l.gstRatePercent === undefined || l.gstRatePercent === null ? '' : String(l.gstRatePercent),
  };
}

const emptyDraft = (): LineDraft => ({
  key: nextKey(), productId: '', productLabel: '', rawDescription: '', uom: 'PCS',
  originalQty: '0', alteredQty: '0', varianceReason: '', varianceNote: '', rate: '', gstRatePercent: '',
});

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

export default function ChainDetailPage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const chainId = routeParams?.id ?? '';

  const { data, isLoading, error, mutate } = useSWR<{ success: boolean; data: ChainDetail }>(
    chainId ? `/api/v1/ops/chains/${chainId}` : null,
    (url: string) => apiFetch<{ success: boolean; data: ChainDetail }>(url),
  );

  const { data: docsResp, mutate: mutateDocs } = useSWR<{ success: boolean; data: DocRow[] }>(
    chainId ? `/api/v1/ops/chains/${chainId}/documents` : null,
    (url: string) => apiFetch<{ success: boolean; data: DocRow[] }>(url),
  );

  const chain = data?.data;
  const docs = docsResp?.data ?? [];

  const [drafts, setDrafts] = useState<LineDraft[]>([]);
  const [linesDirty, setLinesDirty] = useState(false);
  const [action, setAction] = useState<ActionKey>(null);
  const [busy, setBusy] = useState(false);

  // Shared form state for the action dialogs.
  const [f, setF] = useState<Record<string, string>>({});
  const setField = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const [deliveryQty, setDeliveryQty] = useState<Record<string, string>>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Hydrate the line editor whenever the chain reloads, unless there are unsaved
  // edits \u2014 overwriting a user's typing would be worse than a stale table.
  useEffect(() => {
    if (!chain || linesDirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating local edit state from fetched data, not a render-time derivation
    setDrafts(chain.lines.length > 0 ? chain.lines.map(lineToDraft) : [emptyDraft()]);
  }, [chain, linesDirty]);

  const openAction = (key: ActionKey, preset: Record<string, string> = {}) => {
    setF(preset);
    setAction(key);
  };

  const run = async (fn: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      setAction(null);
      setLinesDirty(false);
      await mutate();
      await mutateDocs();
    } catch (err) {
      toast.error(deskErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // \u2500\u2500\u2500 Line editing \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const setDraft = (key: string, patch: Partial<LineDraft>) => {
    setLinesDirty(true);
    setDrafts((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addDraft = () => {
    setLinesDirty(true);
    setDrafts((ls) => [...ls, emptyDraft()]);
  };

  const removeDraft = (key: string) => {
    setLinesDirty(true);
    setDrafts((ls) => (ls.length === 1 ? [emptyDraft()] : ls.filter((l) => l.key !== key)));
  };

  const saveLines = async () => {
    const filled = drafts.filter((l) => l.productId || l.rawDescription.trim());
    if (filled.length === 0) {
      toast.error('Add at least one line item');
      return;
    }

    // Validate client-side first so the user sees the specific line, not a
    // generic server rejection.
    const seen = new Set<string>();
    for (const [i, l] of filled.entries()) {
      const label = l.productLabel || l.rawDescription || `Line ${i + 1}`;
      const po = Number(l.originalQty);
      const fin = Number(l.alteredQty);

      if (!Number.isFinite(po) || po < 0) { toast.error(`${label}: PO quantity is not valid`); return; }
      if (!Number.isFinite(fin) || fin < 0) { toast.error(`${label}: final quantity is not valid`); return; }
      if (po !== fin && !l.varianceReason) {
        toast.error(`${label}: choose a reason for the quantity change`);
        return;
      }
      if (l.varianceReason === 'OTHER' && !l.varianceNote.trim()) {
        toast.error(`${label}: a note is required when the reason is Other`);
        return;
      }
      if (l.rate !== '' && (!Number.isFinite(Number(l.rate)) || Number(l.rate) < 0)) {
        toast.error(`${label}: rate is not valid`);
        return;
      }
      if (l.productId) {
        if (seen.has(l.productId)) { toast.error(`${label} appears more than once`); return; }
        seen.add(l.productId);
      }
    }

    await run(async () => {
      await deskJson.put(`/api/v1/ops/chains/${chainId}/lines`, {
        lines: filled.map((l, idx) => ({
          productId: l.productId || undefined,
          rawDescription: l.rawDescription.trim() || undefined,
          uom: l.uom || 'PCS',
          originalQty: Number(l.originalQty),
          alteredQty: Number(l.alteredQty),
          varianceReason: l.varianceReason || undefined,
          varianceNote: l.varianceNote.trim() || undefined,
          rate: l.rate === '' ? undefined : Number(l.rate),
          gstRatePercent: l.gstRatePercent === '' ? undefined : Number(l.gstRatePercent),
          sortOrder: idx,
        })),
      });
    }, 'Line items saved');
  };

  // \u2500\u2500\u2500 Documents \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const doUpload = async () => {
    if (!uploadFile) { toast.error('Choose a file to upload'); return; }
    if (!f.docType) { toast.error('Choose what kind of document this is'); return; }

    await run(async () => {
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('docType', f.docType);
      if (f.notes) form.append('notes', f.notes);
      await deskUpload(`/api/v1/ops/chains/${chainId}/documents`, form);
      setUploadFile(null);
    }, 'Document uploaded');
  };

  const generateAltered = async (fileFormat: 'pdf' | 'xlsx') => {
    await run(async () => {
      await deskJson.post(`/api/v1/ops/chains/${chainId}/altered-order`, { format: fileFormat });
    }, `Altered order generated as ${fileFormat.toUpperCase()}`);
  };

  // \u2500\u2500\u2500 Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  if (isLoading) {
    return (
      <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Chains', href: '/desk/chains' }, { label: 'Loading\u2026' }]}>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !chain) {
    return (
      <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Chains', href: '/desk/chains' }, { label: 'Not found' }]}>
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icon={Ban}
            title="Chain not available"
            description={deskErrorMessage(error, 'It may have been deleted, or it is not assigned to you.')}
            action={{ label: 'Back to chains', onClick: () => router.push('/desk/chains') }}
          />
        </div>
      </AdminLayout>
    );
  }

  const can = (s: string) => chain.allowedTransitions.includes(s);
  const manufacturerEmail =
    typeof chain.manufacturerId === 'object' ? chain.manufacturerId?.primaryEmail : undefined;
  const alteredDoc = docs.find((d) => d.docType === 'ALTERED_ORDER');

  return (
    <AdminLayout
      breadcrumb={[
        { label: 'Work Desk', href: '/desk' },
        { label: 'Chains', href: '/desk/chains' },
        { label: chain.chainNumber },
      ]}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/desk/chains')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{chain.chainNumber}</h1>
                <StatusBadge status={chain.status} />
                {chain.isOnHold && <StatusBadge status="ON_HOLD" />}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Created {fmtDateTime(chain.createdAt)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => openAction('assign')}>
              <UserCog className="h-3.5 w-3.5 mr-1.5" /> Assign
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openAction('hold', { reason: '' })}
            >
              {chain.isOnHold
                ? <><PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Release Hold</>
                : <><PauseCircle className="h-3.5 w-3.5 mr-1.5" /> Put On Hold</>}
            </Button>
            {chain.allowedTransitions.length > 0 && (
              <Button size="sm" onClick={() => openAction('status', { toStatus: chain.allowedTransitions[0] })}>
                Change Status
              </Button>
            )}
          </div>
        </div>

        {chain.isOnHold && chain.holdReason && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
            <strong className="font-medium">On hold:</strong> {chain.holdReason}
          </div>
        )}
        {chain.status === 'CANCELLED' && (
          <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <strong className="font-medium">Cancelled.</strong> {chain.cancelReason ?? ''} This chain is closed to further changes.
          </div>
        )}

        {/* Facts */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Fact label="Canteen" value={refName(chain.canteenId)} />
          <Fact label="Manufacturer" value={refName(chain.manufacturerId)} />
          <Fact label="Assigned to" value={refName(chain.assignedTo, 'Unassigned')} />
          <Fact label="Source PO" value={`${chain.sourcePoNumber ?? '\u2014'}${chain.sourcePoDate ? ` \u00b7 ${fmtDate(chain.sourcePoDate)}` : ''}`} />
          <Fact label="Ship to" value={<span className="text-xs">{addressText(chain.shipToAddressId)}</span>} />
          <Fact label="Bill to" value={<span className="text-xs">{addressText(chain.billToAddressId)}</span>} />
          <Fact label="PO value" value={<span className="tabular-nums">{money(chain.originalOrderValue)}</span>} />
          <Fact label="Final value" value={<span className="tabular-nums font-medium">{money(chain.alteredOrderValue)}</span>} />
        </div>

        {/* Lifecycle */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Lifecycle</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Fact label="Tax invoice" value={`${chain.taxInvoiceNumber ?? '\u2014'}${chain.taxInvoiceValue ? ` \u00b7 ${money(chain.taxInvoiceValue)}` : ''}`} />
            <Fact label="Portal" value={chain.portalApprovedAt ? `Approved ${fmtDate(chain.portalApprovedAt)}` : chain.portalUploadedAt ? `Uploaded ${fmtDate(chain.portalUploadedAt)}` : '\u2014'} />
            <Fact label="Sales order" value={`${chain.soNumber ?? '\u2014'}${chain.soDate ? ` \u00b7 ${fmtDate(chain.soDate)}` : ''}`} />
            <Fact label="Dispatch" value={chain.dispatch?.dispatchedAt ? `${chain.dispatch.transporter ?? 'Dispatched'} \u00b7 ${fmtDate(chain.dispatch.dispatchedAt)}` : '\u2014'} />
            <Fact label="Delivered" value={fmtDate(chain.deliveredAt)} />
            <Fact label="Canteen payment" value={chain.canteenPayment?.status ? `${chain.canteenPayment.status} \u00b7 ${money(chain.canteenPayment.amount)}` : '\u2014'} />
            <Fact label="Commission" value={chain.commission?.invoiceNumber ? `${chain.commission.invoiceNumber} \u00b7 ${money(chain.commission.computedAmount)}` : '\u2014'} />
            <Fact label="Commission received" value={chain.commission?.receivedAt ? `${fmtDate(chain.commission.receivedAt)} \u00b7 ${money(chain.commission.receivedAmount)}` : '\u2014'} />
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
            <Button variant="outline" size="sm" onClick={() => openAction('taxInvoice')}>
              <ReceiptText className="h-3.5 w-3.5 mr-1.5" /> Record Tax Invoice
            </Button>
            <Button variant="outline" size="sm" onClick={() => openAction('portal')}>
              Mark Uploaded on Portal
            </Button>
            <Button variant="outline" size="sm" onClick={() => openAction('portalDecision', { decision: 'approved' })}>
              Portal Decision
            </Button>
            <Button variant="outline" size="sm" onClick={() => openAction('salesOrder')}>
              Record Sales Order
            </Button>
            <Button variant="outline" size="sm" onClick={() => openAction('dispatch')}>
              <Truck className="h-3.5 w-3.5 mr-1.5" /> Record Dispatch
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeliveryQty(
                  Object.fromEntries(chain.lines.map((l) => [String(l._id), String(l.deliveredQty ?? l.alteredQty)])),
                );
                openAction('delivery', { deliveredAt: new Date().toISOString().slice(0, 10) });
              }}
            >
              <PackageCheck className="h-3.5 w-3.5 mr-1.5" /> Record Delivery
            </Button>
            <Button variant="outline" size="sm" onClick={() => openAction('payment', { status: 'paid', amount: String(chain.alteredOrderValue ?? '') })}>
              <IndianRupee className="h-3.5 w-3.5 mr-1.5" /> Record Payment
            </Button>
            <Button variant="outline" size="sm" onClick={() => openAction('commissionRaise')}>
              Raise Commission
            </Button>
            <Button variant="outline" size="sm" onClick={() => openAction('commissionReceive', { receivedAt: new Date().toISOString().slice(0, 10), receivedAmount: String(chain.commission?.computedAmount ?? '') })}>
              Record Commission Receipt
            </Button>
            {can('CANCELLED') && (
              <Button variant="ghost" size="sm" onClick={() => openAction('cancel')}>
                <Ban className="h-3.5 w-3.5 mr-1.5" /> Cancel Chain
              </Button>
            )}
            {chain.commission?.receivedAt && chain.status !== 'CLOSED' && (
              <Button size="sm" onClick={() => run(async () => { await deskJson.post(`/api/v1/ops/chains/${chainId}/close`, {}); }, 'Chain closed')}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Close Chain
              </Button>
            )}
          </div>
        </div>

        {/* Order lines */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Order Lines</h2>
              <p className="text-xs text-gray-500">
                {chain.linesEditable
                  ? 'Change the final quantity and give a reason. The altered order is generated from this table.'
                  : `Lines are locked at ${statusLabel(chain.status)}.`}
              </p>
            </div>
            {chain.linesEditable && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={addDraft}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
                </Button>
                <Button size="sm" onClick={saveLines} disabled={busy || !linesDirty}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Save Lines
                </Button>
              </div>
            )}
          </div>

          {chain.linesEditable ? (
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-[1.6fr_70px_80px_80px_1fr_90px_70px_32px] gap-2 px-4 py-2 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <span>Item</span><span>UOM</span><span>PO Qty</span><span>Final Qty</span>
                <span>Reason</span><span>Rate</span><span>GST %</span><span />
              </div>
              {drafts.map((l) => {
                const changed = Number(l.originalQty) !== Number(l.alteredQty);
                return (
                  <div key={l.key} className="px-4 py-2 space-y-1.5">
                    <div className="grid grid-cols-[1.6fr_70px_80px_80px_1fr_90px_70px_32px] gap-2 items-center">
                      <div>
                        <EntityPicker
                          endpoint="/api/v1/ops/products"
                          value={l.productId}
                          onChange={(id, label) => setDraft(l.key, { productId: id, productLabel: label ?? '' })}
                          placeholder="Search products\u2026"
                          labelKey="name"
                          subLabelKey="sku"
                        />
                      </div>
                      <Input value={l.uom} onChange={(e) => setDraft(l.key, { uom: e.target.value.toUpperCase() })} />
                      <Input type="number" value={l.originalQty} onChange={(e) => setDraft(l.key, { originalQty: e.target.value })} className="text-right" />
                      <Input
                        type="number"
                        value={l.alteredQty}
                        onChange={(e) => setDraft(l.key, { alteredQty: e.target.value })}
                        className={`text-right ${changed ? 'border-amber-400' : ''}`}
                      />
                      <Select value={l.varianceReason} onChange={(e) => setDraft(l.key, { varianceReason: e.target.value })}>
                        <option value="">{changed ? 'Reason required\u2026' : 'No change'}</option>
                        {VARIANCE_REASONS.map((r) => (
                          <option key={r} value={r}>{VARIANCE_LABEL[r]}</option>
                        ))}
                      </Select>
                      <Input type="number" value={l.rate} onChange={(e) => setDraft(l.key, { rate: e.target.value })} placeholder="0.00" className="text-right" />
                      <Input type="number" value={l.gstRatePercent} onChange={(e) => setDraft(l.key, { gstRatePercent: e.target.value })} placeholder="\u2014" className="text-right" />
                      <button
                        type="button"
                        onClick={() => removeDraft(l.key)}
                        className="flex items-center justify-center text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {!l.productId && (
                      <Input
                        value={l.rawDescription}
                        onChange={(e) => setDraft(l.key, { rawDescription: e.target.value })}
                        placeholder="Or type the item exactly as printed on the canteen PO"
                        className="text-xs"
                      />
                    )}
                    {l.varianceReason === 'OTHER' && (
                      <Input
                        value={l.varianceNote}
                        onChange={(e) => setDraft(l.key, { varianceNote: e.target.value })}
                        placeholder="Explain the change (required for Other)"
                        className="text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Item', 'UOM', 'PO Qty', 'Final Qty', 'Delivered', 'Short', 'Reason', 'Rate', 'Amount'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chain.lines.map((l) => {
                  const product = typeof l.productId === 'object' ? l.productId : null;
                  return (
                    <tr key={String(l._id)} className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-gray-800 text-xs">
                        {product ? `${product.sku ?? ''} \u2014 ${product.name ?? ''}` : (l.rawDescription ?? '\u2014')}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{l.uom}</td>
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">{l.originalQty}</td>
                      <td className="px-4 py-2.5 text-gray-900 tabular-nums font-medium">{l.alteredQty}</td>
                      <td className="px-4 py-2.5 text-gray-600 tabular-nums">{l.deliveredQty ?? '\u2014'}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${l.shortSuppliedQty ? 'text-red-600' : 'text-gray-300'}`}>
                        {l.shortSuppliedQty || '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {l.varianceReason ? VARIANCE_LABEL[l.varianceReason] ?? l.varianceReason : '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 tabular-nums">{money(l.rate)}</td>
                      <td className="px-4 py-2.5 text-gray-900 tabular-nums">{money(l.lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={7} className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Totals</td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500 tabular-nums">{money(chain.totals.taxableValue)}</td>
                  <td className="px-4 py-2.5 text-gray-900 font-semibold tabular-nums">{money(chain.totals.lineTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Documents */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
              <p className="text-xs text-gray-500">Everything filed against this chain, newest version first.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => generateAltered('pdf')} disabled={busy}>
                <FileDown className="h-3.5 w-3.5 mr-1.5" /> Altered Order PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => generateAltered('xlsx')} disabled={busy}>
                <FileDown className="h-3.5 w-3.5 mr-1.5" /> Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  openAction('email', {
                    toEmails: manufacturerEmail ?? '',
                    subject: `Revised Order ${chain.chainNumber}`,
                    bodyText: '',
                    attachFormat: alteredDoc ? '' : 'pdf',
                    attachDocumentId: alteredDoc?._id ?? '',
                  })
                }
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" /> Email Altered Order
              </Button>
              <Button size="sm" onClick={() => openAction('upload', { docType: 'SOURCE_PO' })}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
              </Button>
            </div>
          </div>

          {docs.length === 0 ? (
            <EmptyState
              icon={Paperclip}
              title="No documents yet"
              description="Upload the canteen PO to start, or generate the altered order once the lines are set."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Type', 'File', 'Version', 'Uploaded', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d._id} className="border-b border-gray-100">
                    <td className="px-4 py-2.5 text-gray-700 text-xs">{DOC_LABEL[d.docType] ?? d.docType}</td>
                    <td className="px-4 py-2.5 text-gray-800 text-xs max-w-[280px] truncate">{d.fileName}</td>
                    <td className="px-4 py-2.5 text-gray-500">v{d.version}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDateTime(d.uploadedAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={deskDocumentUrl(d._id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs mr-3"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={deskDocumentUrl(d._id, true)}
                        className="text-gray-500 hover:underline text-xs"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Timeline</h2>
            <Button variant="outline" size="sm" onClick={() => openAction('comment')}>
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Add Comment
            </Button>
          </div>
          {chain.events.length === 0 ? (
            <EmptyState icon={MessageSquare} title="Nothing recorded yet" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {chain.events.map((e) => (
                <li key={e._id} className="px-5 py-3 flex items-start gap-3">
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      {e.message ??
                        (e.fromStatus && e.toStatus
                          ? `${statusLabel(e.fromStatus)} \u2192 ${statusLabel(e.toStatus)}`
                          : e.eventType)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {refName(e.actorUserId, 'System')} \u00b7 {fmtDateTime(e.createdAt)}
                      {e.toStatus ? ` \u00b7 ${statusLabel(e.toStatus)}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* \u2500\u2500\u2500 Action dialogs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}

      <Dialog
        open={action === 'status'}
        onClose={() => setAction(null)}
        title="Change Status"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || !f.toStatus}
              onClick={() => run(async () => {
                await deskJson.patch(`/api/v1/ops/chains/${chainId}/status`, {
                  toStatus: f.toStatus,
                  message: f.message || undefined,
                });
              }, 'Status updated')}
            >
              Update
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Only steps the pipeline allows from {statusLabel(chain.status)} are listed.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">New status</label>
            <Select value={f.toStatus ?? ''} onChange={(e) => setField('toStatus', e.target.value)}>
              <option value="">Select\u2026</option>
              {chain.allowedTransitions.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Note (optional)</label>
            <Textarea value={f.message ?? ''} onChange={(e) => setField('message', e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'assign'}
        onClose={() => setAction(null)}
        title="Assign Chain"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || !f.toUserId}
              onClick={() => run(async () => {
                await deskJson.patch(`/api/v1/ops/chains/${chainId}/assign`, {
                  toUserId: f.toUserId,
                  reason: f.reason || undefined,
                });
              }, 'Chain reassigned')}
            >
              Assign
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Hand-over is recorded in the timeline. Reassigning changes who can see this chain.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Assign to *</label>
            <EntityPicker
              endpoint="/api/v1/ops/users"
              value={f.toUserId ?? ''}
              onChange={(id) => setField('toUserId', id)}
              placeholder="Search desk users\u2026"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Reason (optional)</label>
            <Input value={f.reason ?? ''} onChange={(e) => setField('reason', e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'hold'}
        onClose={() => setAction(null)}
        title={chain.isOnHold ? 'Release Hold' : 'Put On Hold'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || (!chain.isOnHold && !(f.reason ?? '').trim())}
              onClick={() => run(async () => {
                await deskJson.patch(`/api/v1/ops/chains/${chainId}/hold`, {
                  hold: !chain.isOnHold,
                  reason: f.reason || undefined,
                });
              }, chain.isOnHold ? 'Hold released' : 'Chain put on hold')}
            >
              {chain.isOnHold ? 'Release' : 'Put On Hold'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 block">
            {chain.isOnHold ? 'Note (optional)' : 'Reason *'}
          </label>
          <Textarea
            value={f.reason ?? ''}
            onChange={(e) => setField('reason', e.target.value)}
            placeholder={chain.isOnHold ? 'Why is it being released?' : 'Why is this chain being paused?'}
          />
        </div>
      </Dialog>

      <Dialog
        open={action === 'comment'}
        onClose={() => setAction(null)}
        title="Add Comment"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || !(f.message ?? '').trim()}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/comment`, { message: f.message });
              }, 'Comment added')}
            >
              Add
            </Button>
          </div>
        }
      >
        <Textarea
          value={f.message ?? ''}
          onChange={(e) => setField('message', e.target.value)}
          placeholder="Anything the next person handling this chain should know"
        />
      </Dialog>

      <Dialog
        open={action === 'taxInvoice'}
        onClose={() => setAction(null)}
        title="Record Tax Invoice"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/tax-invoice`, {
                  taxInvoiceNumber: f.taxInvoiceNumber,
                  taxInvoiceDate: f.taxInvoiceDate,
                  taxInvoiceValue: Number(f.taxInvoiceValue),
                });
              }, 'Tax invoice recorded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            The manufacturer&apos;s invoice. This is the document that gets uploaded to the canteen portal.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Invoice number *</label>
            <Input value={f.taxInvoiceNumber ?? ''} onChange={(e) => setField('taxInvoiceNumber', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Invoice date *</label>
              <Input type="date" value={f.taxInvoiceDate ?? ''} onChange={(e) => setField('taxInvoiceDate', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Invoice value *</label>
              <Input type="number" value={f.taxInvoiceValue ?? ''} onChange={(e) => setField('taxInvoiceValue', e.target.value)} className="text-right" />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'portal'}
        onClose={() => setAction(null)}
        title="Mark Uploaded on Portal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/portal`, {
                  portalUploadedAt: f.portalUploadedAt || undefined,
                  note: f.note || undefined,
                });
              }, 'Recorded as uploaded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Uploaded on</label>
            <Input type="date" value={f.portalUploadedAt ?? ''} onChange={(e) => setField('portalUploadedAt', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Leave blank to use today.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Note</label>
            <Input value={f.note ?? ''} onChange={(e) => setField('note', e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'portalDecision'}
        onClose={() => setAction(null)}
        title="Portal Decision"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || (f.decision === 'rejected' && !(f.note ?? '').trim())}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/portal-decision`, {
                  decision: f.decision,
                  note: f.note || undefined,
                });
              }, 'Portal decision recorded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Decision</label>
            <Select value={f.decision ?? 'approved'} onChange={(e) => setField('decision', e.target.value)}>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Note {f.decision === 'rejected' ? '*' : '(optional)'}
            </label>
            <Textarea value={f.note ?? ''} onChange={(e) => setField('note', e.target.value)} />
            {f.decision === 'rejected' && (
              <p className="text-xs text-gray-400 mt-1">
                A rejection clears the approval stamp, so a sales order cannot be recorded against it.
              </p>
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'salesOrder'}
        onClose={() => setAction(null)}
        title="Record Sales Order"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/sales-order`, {
                  soNumber: f.soNumber,
                  soDate: f.soDate,
                });
              }, 'Sales order recorded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">SO number *</label>
            <Input value={f.soNumber ?? ''} onChange={(e) => setField('soNumber', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">SO date *</label>
            <Input type="date" value={f.soDate ?? ''} onChange={(e) => setField('soDate', e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'dispatch'}
        onClose={() => setAction(null)}
        title="Record Dispatch"
        width="max-w-[560px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || !f.dispatchedAt}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/dispatch`, {
                  transporter: f.transporter || undefined,
                  lrNumber: f.lrNumber || undefined,
                  ewayBillNumber: f.ewayBillNumber || undefined,
                  dispatchedAt: f.dispatchedAt,
                  expectedDeliveryAt: f.expectedDeliveryAt || undefined,
                });
              }, 'Dispatch recorded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Transporter</label>
              <Input value={f.transporter ?? ''} onChange={(e) => setField('transporter', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">LR number</label>
              <Input value={f.lrNumber ?? ''} onChange={(e) => setField('lrNumber', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">E-way bill</label>
              <Input value={f.ewayBillNumber ?? ''} onChange={(e) => setField('ewayBillNumber', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Dispatched on *</label>
              <Input type="date" value={f.dispatchedAt ?? ''} onChange={(e) => setField('dispatchedAt', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Expected delivery</label>
              <Input type="date" value={f.expectedDeliveryAt ?? ''} onChange={(e) => setField('expectedDeliveryAt', e.target.value)} />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'delivery'}
        onClose={() => setAction(null)}
        title="Record Delivery"
        width="max-w-[620px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || !f.deliveredAt}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/delivery`, {
                  deliveredAt: f.deliveredAt,
                  note: f.note || undefined,
                  lines: Object.entries(deliveryQty)
                    .filter(([, v]) => v !== '')
                    .map(([lineId, v]) => ({ lineId, deliveredQty: Number(v) })),
                });
              }, 'Delivery recorded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Enter what actually arrived. The status is worked out from these numbers \u2014 fully
            delivered, partially delivered or short supplied.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Delivered on *</label>
            <Input type="date" value={f.deliveredAt ?? ''} onChange={(e) => setField('deliveredAt', e.target.value)} className="w-44" />
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <div className="grid grid-cols-[1fr_80px_90px] gap-2 bg-gray-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
              <span>Item</span><span className="text-right">Agreed</span><span className="text-right">Delivered</span>
            </div>
            {chain.lines.map((l) => {
              const product = typeof l.productId === 'object' ? l.productId : null;
              const id = String(l._id);
              return (
                <div key={id} className="grid grid-cols-[1fr_80px_90px] gap-2 items-center px-3 py-1.5 border-t border-gray-100">
                  <span className="text-xs text-gray-700 truncate">
                    {product ? `${product.sku ?? ''} \u2014 ${product.name ?? ''}` : (l.rawDescription ?? '\u2014')}
                  </span>
                  <span className="text-xs text-gray-500 text-right tabular-nums">{l.alteredQty} {l.uom}</span>
                  <Input
                    type="number"
                    value={deliveryQty[id] ?? ''}
                    onChange={(e) => setDeliveryQty((p) => ({ ...p, [id]: e.target.value }))}
                    className="text-right"
                  />
                </div>
              );
            })}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Note</label>
            <Input value={f.note ?? ''} onChange={(e) => setField('note', e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'payment'}
        onClose={() => setAction(null)}
        title="Record Canteen Payment"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/payment`, {
                  status: f.status,
                  amount: Number(f.amount || 0),
                  paidAt: f.paidAt || undefined,
                  referenceNo: f.referenceNo || undefined,
                });
              }, 'Payment recorded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            The canteen pays the manufacturer. Only a full payment moves the chain to Payment
            Received, because commission is raised against a completed collection.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Status *</label>
              <Select value={f.status ?? 'paid'} onChange={(e) => setField('status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Amount *</label>
              <Input type="number" value={f.amount ?? ''} onChange={(e) => setField('amount', e.target.value)} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Paid on</label>
              <Input type="date" value={f.paidAt ?? ''} onChange={(e) => setField('paidAt', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Reference</label>
              <Input value={f.referenceNo ?? ''} onChange={(e) => setField('referenceNo', e.target.value)} />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'commissionRaise'}
        onClose={() => setAction(null)}
        title="Raise Commission Invoice"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => run(async () => {
                await deskJson.post(`/api/v1/ops/chains/${chainId}/commission`, {
                  overrideAmount: f.overrideAmount ? Number(f.overrideAmount) : undefined,
                  note: f.note || undefined,
                });
              }, 'Commission invoice raised')}
            >
              Raise
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            The applicable commission rule is resolved automatically \u2014 product rules beat canteen
            rules, which beat manufacturer rules. A number is generated and the invoice PDF is filed
            against this chain. This can only be done once.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Override amount (optional)</label>
            <Input
              type="number"
              value={f.overrideAmount ?? ''}
              onChange={(e) => setField('overrideAmount', e.target.value)}
              placeholder="Leave blank to use the rule"
              className="text-right"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Note</label>
            <Input value={f.note ?? ''} onChange={(e) => setField('note', e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'commissionReceive'}
        onClose={() => setAction(null)}
        title="Record Commission Receipt"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => run(async () => {
                await deskJson.patch(`/api/v1/ops/chains/${chainId}/commission`, {
                  receivedAmount: Number(f.receivedAmount || 0),
                  receivedAt: f.receivedAt,
                  referenceNo: f.referenceNo || undefined,
                });
              }, 'Commission receipt recorded')}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Amount received *</label>
              <Input type="number" value={f.receivedAmount ?? ''} onChange={(e) => setField('receivedAmount', e.target.value)} className="text-right" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Received on *</label>
              <Input type="date" value={f.receivedAt ?? ''} onChange={(e) => setField('receivedAt', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Reference</label>
            <Input value={f.referenceNo ?? ''} onChange={(e) => setField('referenceNo', e.target.value)} />
          </div>
          <p className="text-xs text-gray-400">
            A receipt below the invoiced amount is accepted and reported as a shortfall.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={action === 'upload'}
        onClose={() => { setAction(null); setUploadFile(null); }}
        title="Upload Document"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setAction(null); setUploadFile(null); }}>Cancel</Button>
            <Button disabled={busy || !uploadFile} onClick={doUpload}>Upload</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Document type *</label>
            <Select value={f.docType ?? ''} onChange={(e) => setField('docType', e.target.value)}>
              <option value="">Select\u2026</option>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{DOC_LABEL[t]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">File *</label>
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
            />
            <p className="text-xs text-gray-400 mt-1">PDF, Excel or image, up to 15 MB.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
            <Input value={f.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'email'}
        onClose={() => setAction(null)}
        title="Email Altered Order"
        width="max-w-[600px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={busy || !(f.toEmails ?? '').trim() || !(f.subject ?? '').trim() || !(f.bodyText ?? '').trim()}
              onClick={() => run(async () => {
                await deskJson.post('/api/v1/ops/emails', {
                  chainId,
                  toEmails: f.toEmails,
                  ccEmails: f.ccEmails || undefined,
                  subject: f.subject,
                  bodyText: f.bodyText,
                  attachDocumentId: f.attachDocumentId || undefined,
                  attachFormat: f.attachDocumentId ? undefined : (f.attachFormat || undefined),
                });
                router.push(`/desk/emails?chainId=${chainId}&status=draft`);
              }, 'Draft created \u2014 review it before sending')}
            >
              Create Draft
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
            Nothing is sent yet. This creates a draft you review in the outbox, then send.
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">To *</label>
            <Input
              value={f.toEmails ?? ''}
              onChange={(e) => setField('toEmails', e.target.value)}
              placeholder="Comma separated"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Cc</label>
            <Input value={f.ccEmails ?? ''} onChange={(e) => setField('ccEmails', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Subject *</label>
            <Input value={f.subject ?? ''} onChange={(e) => setField('subject', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Message *</label>
            <Textarea
              value={f.bodyText ?? ''}
              onChange={(e) => setField('bodyText', e.target.value)}
              className="min-h-[140px]"
              placeholder="Leave blank to fall back to the template in Desk Settings after saving"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Attachment</label>
            {alteredDoc ? (
              <Select
                value={f.attachDocumentId ?? ''}
                onChange={(e) => setField('attachDocumentId', e.target.value)}
              >
                <option value={alteredDoc._id}>Attach the generated altered order ({alteredDoc.fileName})</option>
                <option value="">Generate a fresh copy instead</option>
              </Select>
            ) : (
              <Select value={f.attachFormat ?? 'pdf'} onChange={(e) => setField('attachFormat', e.target.value)}>
                <option value="pdf">Generate and attach a PDF</option>
                <option value="xlsx">Generate and attach an Excel file</option>
              </Select>
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === 'cancel'}
        onClose={() => setAction(null)}
        title="Cancel this chain?"
        destructive
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Keep Chain</Button>
            <Button
              variant="destructive"
              disabled={busy || (f.reason ?? '').trim().length < 3}
              onClick={() => run(async () => {
                await deskJson.patch(`/api/v1/ops/chains/${chainId}/cancel`, { reason: f.reason });
              }, 'Chain cancelled')}
            >
              Cancel Chain
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Cancelling is final. The chain stays on record with its documents and timeline, but no
            further steps can be recorded against it.
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Reason *</label>
            <Textarea
              value={f.reason ?? ''}
              onChange={(e) => setField('reason', e.target.value)}
              placeholder="Why is this chain being cancelled?"
            />
            <p className="text-xs text-gray-400 mt-1">At least a few words — this is kept for audit.</p>
          </div>
        </div>
      </Dialog>

    </AdminLayout>
  );
}
