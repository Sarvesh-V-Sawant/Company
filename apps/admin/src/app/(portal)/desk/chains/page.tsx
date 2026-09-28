'use client';
/**
 * Chain list (Phase 30.02).
 *
 * Replaces the ComingSoonCard stub. Follows the price-lists page pattern exactly:
 * useSWR + apiFetch, URL-driven filters, EntityPicker for relations, Dialog for
 * create, sonner toasts, shared Pagination.
 */
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Link2, Search, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { Dialog } from '@components/ui/dialog';
import StatusBadge from '@components/shared/StatusBadge';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { TableSkeleton } from '@components/ui/skeleton';
import EntityPicker from '@components/shared/EntityPicker';
import { apiFetch } from '@lib/utils/api-client';
import { usePagination } from '@/hooks/usePagination';

const CHAIN_STATUSES = [
  'PO_RECEIVED', 'UNDER_REVIEW', 'ALTERED', 'PENDING_INTERNAL_APPROVAL',
  'SENT_TO_MANUFACTURER', 'AWAITING_TAX_INVOICE', 'TAX_INVOICE_RECEIVED',
  'UPLOADED_ON_PORTAL', 'PORTAL_APPROVED', 'REJECTED_ON_PORTAL', 'SO_RECEIVED',
  'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'SHORT_SUPPLIED',
  'PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'COMMISSION_RAISED',
  'COMMISSION_RECEIVED', 'CLOSED', 'ON_HOLD', 'CANCELLED',
] as const;

const STATUS_LABEL = (s: string) =>
  s.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');

type Ref = { _id: string; code?: string; name?: string; firstName?: string; lastName?: string } | string;

interface Chain {
  _id: string;
  chainNumber: string;
  status: string;
  canteenId?: Ref;
  manufacturerId?: Ref;
  assignedTo?: Ref;
  sourcePoNumber?: string;
  sourcePoDate?: string;
  originalOrderValue?: number;
  alteredOrderValue?: number;
  isOnHold?: boolean;
  createdAt: string;
}

interface ApiResp {
  success: boolean;
  data: Chain[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

let _debounce: ReturnType<typeof setTimeout> | null = null;

const emptyForm = {
  canteenId: '',
  manufacturerId: '',
  shipToAddressId: '',
  billToAddressId: '',
  sourcePoNumber: '',
  sourcePoDate: '',
};

function refName(ref: Ref | undefined, fallback = '\u2014') {
  if (!ref) return fallback;
  if (typeof ref === 'string') return ref;
  if (ref.firstName || ref.lastName) return `${ref.firstName ?? ''} ${ref.lastName ?? ''}`.trim();
  if (ref.code && ref.name) return `${ref.code} \u2013 ${ref.name}`;
  return ref.name ?? fallback;
}

function money(v?: number) {
  if (v === undefined || v === null) return '\u2014';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ChainsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const bucket = params.get('bucket') ?? '';
  const onHold = params.get('onHold') ?? '';

  const query = buildQuery({
    search: search || undefined,
    status: status || undefined,
    bucket: bucket || undefined,
    onHold: onHold || undefined,
  });

  const { data, isLoading, mutate } = useSWR<ApiResp>(
    `/api/v1/ops/chains?${query}`,
    (url: string) => apiFetch<ApiResp>(url),
  );
  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/chains?${sp.toString()}`);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!form.canteenId) {
      toast.error('Select the canteen that raised the purchase order');
      return;
    }
    if (!form.manufacturerId) {
      toast.error('Select the manufacturer this order goes to');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ success: boolean; data: { _id: string; chainNumber: string } }>(
        '/api/v1/ops/chains',
        {
          method: 'POST',
          body: JSON.stringify({
            canteenId: form.canteenId,
            manufacturerId: form.manufacturerId,
            shipToAddressId: form.shipToAddressId || undefined,
            billToAddressId: form.billToAddressId || undefined,
            sourcePoNumber: form.sourcePoNumber || undefined,
            sourcePoDate: form.sourcePoDate || undefined,
          }),
        },
      );
      toast.success(`Chain ${res.data.chainNumber} created`);
      setModalOpen(false);
      mutate();
      // Straight into the detail page, which is where the line items get added.
      router.push(`/desk/chains/${res.data._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the chain');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (d?: string) => {
    if (!d) return '\u2014';
    try {
      return format(new Date(d), 'dd MMM yyyy');
    } catch {
      return d;
    }
  };

  const filtered = Boolean(search || status || bucket || onHold);

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Chains' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Chains</h1>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> New Chain
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-8"
              placeholder="Search chain or PO number\u2026"
              defaultValue={search}
              onChange={(e) => {
                if (_debounce) clearTimeout(_debounce);
                _debounce = setTimeout(() => updateParam('search', e.target.value), 400);
              }}
            />
          </div>
          <Select value={status} onChange={(e) => updateParam('status', e.target.value)} className="w-52">
            <option value="">All Statuses</option>
            {CHAIN_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL(s)}</option>
            ))}
          </Select>
          <Select value={bucket} onChange={(e) => updateParam('bucket', e.target.value)} className="w-40">
            <option value="">All Stages</option>
            <option value="open">Open only</option>
            <option value="po">Purchase Orders</option>
            <option value="altered">Altered</option>
            <option value="taxInvoice">Tax Invoices</option>
            <option value="portal">Portal</option>
            <option value="so">Sales Orders</option>
            <option value="transit">In Transit</option>
            <option value="payment">Payments</option>
            <option value="commission">Commission</option>
            <option value="closed">Closed</option>
          </Select>
          <Select value={onHold} onChange={(e) => updateParam('onHold', e.target.value)} className="w-36">
            <option value="">Hold: Any</option>
            <option value="true">On hold</option>
            <option value="false">Not on hold</option>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Chain', 'Canteen', 'Manufacturer', 'Source PO', 'PO Value', 'Final Value', 'Assigned To', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : items.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Link2}
                      title="No chains yet"
                      description="A chain tracks one canteen purchase order from receipt through to commission received."
                      action={{ label: 'New Chain', onClick: openCreate }}
                      filtered={filtered}
                      onClearFilters={() => router.push('/desk/chains')}
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c._id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/desk/chains/${c._id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900">{c.chainNumber}</span>
                        {c.isOnHold && <PauseCircle className="h-3.5 w-3.5 text-orange-500" />}
                      </div>
                      <span className="text-xs text-gray-400">{fmt(c.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{refName(c.canteenId)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{refName(c.manufacturerId)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {c.sourcePoNumber ?? '\u2014'}
                      {c.sourcePoDate && <div className="text-gray-400">{fmt(c.sourcePoDate)}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-right tabular-nums">{money(c.originalOrderValue)}</td>
                    <td className="px-4 py-3 text-gray-900 text-right tabular-nums font-medium">{money(c.alteredOrderValue)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{refName(c.assignedTo)}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.isOnHold ? 'ON_HOLD' : c.status} /></td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {pagination && pagination.pages > 1 && (
            <Pagination
              page={page}
              totalPages={pagination.pages}
              total={pagination.total}
              limit={limit}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Chain"
        width="max-w-[560px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating\u2026' : 'Create Chain'}</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Create the chain first, then add or import the order lines on the detail page.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Canteen *</label>
              <EntityPicker
                endpoint="/api/v1/ops/canteens"
                value={form.canteenId}
                onChange={(id) => setForm((p) => ({ ...p, canteenId: id, shipToAddressId: '', billToAddressId: '' }))}
                placeholder="Search canteens\u2026"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Manufacturer *</label>
              <EntityPicker
                endpoint="/api/v1/ops/manufacturers"
                value={form.manufacturerId}
                onChange={(id) => setForm((p) => ({ ...p, manufacturerId: id }))}
                placeholder="Search manufacturers\u2026"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Ship To Address</label>
              <EntityPicker
                endpoint="/api/v1/ops/addresses"
                value={form.shipToAddressId}
                onChange={(id) => setForm((p) => ({ ...p, shipToAddressId: id }))}
                placeholder={form.canteenId ? 'Search addresses\u2026' : 'Select a canteen first'}
                labelKey="label"
                subLabelKey="city"
                disabled={!form.canteenId}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Bill To Address</label>
              <EntityPicker
                endpoint="/api/v1/ops/addresses"
                value={form.billToAddressId}
                onChange={(id) => setForm((p) => ({ ...p, billToAddressId: id }))}
                placeholder={form.canteenId ? 'Search addresses\u2026' : 'Select a canteen first'}
                labelKey="label"
                subLabelKey="city"
                disabled={!form.canteenId}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Source PO Number</label>
              <Input
                value={form.sourcePoNumber}
                onChange={(e) => setForm((p) => ({ ...p, sourcePoNumber: e.target.value }))}
                placeholder="As printed on the canteen PO"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Source PO Date</label>
              <Input
                type="date"
                value={form.sourcePoDate}
                onChange={(e) => setForm((p) => ({ ...p, sourcePoDate: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </Dialog>
    </AdminLayout>
  );
}
