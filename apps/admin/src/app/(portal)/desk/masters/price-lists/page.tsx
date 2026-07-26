'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, List, Trash2 } from 'lucide-react';
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

interface PriceListItem { productId: string; rate: number }
interface PriceList {
  _id: string;
  manufacturerId: { _id: string; code: string; name: string } | string;
  canteenId?: { _id: string; code: string; name: string } | string;
  effectiveFrom: string; effectiveTo?: string; items: PriceListItem[]; isActive: boolean;
}
interface PriceListFull extends Omit<PriceList, 'items'> {
  items: { productId: { _id: string; sku: string; name: string } | string; rate: number }[];
}
interface ApiResp { success: boolean; data: PriceList[]; pagination: { page: number; limit: number; total: number; pages: number } }

type ModalState = null | { mode: 'create' } | { mode: 'edit'; id: string };
type LineItem = { productId: string; rate: string; label: string };
const emptyLine = (): LineItem => ({ productId: '', rate: '', label: '' });

const emptyForm = { manufacturerId: '', canteenId: '', effectiveFrom: '', effectiveTo: '' };

function refName(ref: { _id: string; code: string; name: string } | string | undefined, fallback = '—') {
  if (!ref) return fallback;
  if (typeof ref === 'object') return `${ref.code} – ${ref.name}`;
  return String(ref);
}

export default function PriceListsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const active = params.get('isActive') ?? '';
  const mfrId  = params.get('manufacturerId') ?? '';
  const query  = buildQuery({ isActive: active || undefined, manufacturerId: mfrId || undefined });

  const { data, isLoading, mutate } = useSWR<ApiResp>(`/api/v1/ops/price-lists?${query}`, (url: string) => apiFetch<ApiResp>(url));
  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/masters/price-lists?${sp.toString()}`);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setLines([emptyLine()]);
    setModal({ mode: 'create' });
  };

  const openEdit = async (id: string) => {
    setModal({ mode: 'edit', id });
    setLoadingRecord(true);
    try {
      const res = await apiFetch<{ success: boolean; data: PriceListFull }>(`/api/v1/ops/price-lists/${id}`);
      const pl = res.data;
      setForm({
        manufacturerId: typeof pl.manufacturerId === 'object' ? pl.manufacturerId._id : String(pl.manufacturerId),
        canteenId: pl.canteenId ? (typeof pl.canteenId === 'object' ? pl.canteenId._id : String(pl.canteenId)) : '',
        effectiveFrom: pl.effectiveFrom.slice(0, 10),
        effectiveTo: pl.effectiveTo?.slice(0, 10) ?? '',
      });
      setLines(pl.items.length > 0
        ? pl.items.map(i => {
            if (typeof i.productId === 'object') {
              return { productId: i.productId._id, rate: String(i.rate), label: `${i.productId.sku} — ${i.productId.name}` };
            }
            return { productId: String(i.productId), rate: String(i.rate), label: '' };
          })
        : [emptyLine()]);
    } catch { toast.error('Failed to load price list details'); setModal(null); }
    finally { setLoadingRecord(false); }
  };

  const addLine = () => setLines(l => [...l, emptyLine()]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));
  const setLine = (i: number, field: keyof LineItem, val: string) =>
    setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: val } : ln));

  const handleSave = async () => {
    const filled = lines.filter(l => l.productId);
    if (!filled.length) { toast.error('Add at least one line item'); return; }
    const badRate = filled.find(l => l.rate === '' || isNaN(Number(l.rate)) || !isFinite(Number(l.rate)) || Number(l.rate) < 0);
    if (badRate) { toast.error('Enter a valid rate for every line'); return; }
    const seen = new Map<string, string>();
    for (const ln of filled) {
      if (seen.has(ln.productId)) {
        const sku = ln.label ? ln.label.split(' — ')[0] : ln.productId;
        toast.error(`${sku} appears more than once`);
        return;
      }
      seen.set(ln.productId, ln.label);
    }
    const priceItems = filled.map(l => ({ productId: l.productId, rate: Number(l.rate) }));
    setSaving(true);
    try {
      const body = { effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined, items: priceItems };
      if (modal?.mode === 'create') {
        await apiFetch('/api/v1/ops/price-lists', { method: 'POST', body: JSON.stringify({ ...body, manufacturerId: form.manufacturerId, canteenId: form.canteenId || undefined }) });
        toast.success('Price list created');
      } else if (modal?.mode === 'edit') {
        await apiFetch(`/api/v1/ops/price-lists/${modal.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success('Price list updated');
      }
      setModal(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleStatus = async (pl: PriceList) => {
    try {
      await apiFetch(`/api/v1/ops/price-lists/${pl._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !pl.isActive }) });
      toast.success(`Price list ${!pl.isActive ? 'activated' : 'deactivated'}`);
      mutate();
    } catch { toast.error('Status update failed'); }
  };

  const fmt = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; } };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Price Lists' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Price Lists</h1>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Price List</Button>
        </div>

        <div className="flex gap-3">
          <Select value={active} onChange={e => updateParam('isActive', e.target.value)} className="w-36">
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Manufacturer', 'Canteen', 'Effective From', 'Effective To', 'Items', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={7} /> : items.length === 0 ? (
              <tbody><tr><td colSpan={7}>
                <EmptyState icon={List} title="No price lists found" action={{ label: 'Add Price List', onClick: openCreate }}
                  filtered={!!active} onClearFilters={() => router.push('/desk/masters/price-lists')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {items.map(pl => (
                  <tr key={pl._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 text-xs">{refName(pl.manufacturerId)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{refName(pl.canteenId)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(pl.effectiveFrom)}</td>
                    <td className="px-4 py-3 text-gray-500">{pl.effectiveTo ? fmt(pl.effectiveTo) : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{pl.items.length}</td>
                    <td className="px-4 py-3"><StatusBadge status={pl.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(pl._id)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(pl)}>{pl.isActive ? 'Deactivate' : 'Activate'}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {pagination && pagination.pages > 1 && (
            <Pagination page={page} totalPages={pagination.pages} total={pagination.total} limit={limit} onPageChange={setPage} />
          )}
        </div>
      </div>

      <Dialog open={modal !== null} onClose={() => setModal(null)}
        title={modal?.mode === 'create' ? 'Add Price List' : 'Edit Price List'}
        width="max-w-[600px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || loadingRecord}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        }>
        {loadingRecord ? <div className="py-8 text-center text-sm text-gray-400">Loading…</div> : (
          <div className="space-y-3">
            {modal?.mode === 'create' && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Manufacturer *</label>
                  <EntityPicker endpoint="/api/v1/ops/manufacturers" value={form.manufacturerId}
                    onChange={id => setForm(p => ({ ...p, manufacturerId: id }))} placeholder="Search manufacturers…" /></div>
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Canteen (optional)</label>
                  <EntityPicker endpoint="/api/v1/ops/canteens" value={form.canteenId}
                    onChange={id => setForm(p => ({ ...p, canteenId: id }))} placeholder="Leave blank for all canteens" /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Effective From *</label>
                <Input type="date" value={form.effectiveFrom} onChange={e => setForm(p => ({ ...p, effectiveFrom: e.target.value }))} /></div>
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Effective To</label>
                <Input type="date" value={form.effectiveTo} onChange={e => setForm(p => ({ ...p, effectiveTo: e.target.value }))} /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Line Items * <span className="text-gray-400 font-normal">({lines.length} line{lines.length !== 1 ? 's' : ''})</span>
                </label>
                <Button variant="ghost" size="sm" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />Add Line</Button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_100px_32px] gap-0 bg-gray-50 border-b border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <span>Product</span><span>Rate (₹)</span><span />
                </div>
                {lines.map((ln, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_32px] items-center gap-0 border-b border-gray-100 last:border-0 px-2 py-1.5">
                    <div className="pr-2">
                      <EntityPicker endpoint="/api/v1/ops/products" value={ln.productId}
                        onChange={(id, lbl) => setLines(l => l.map((ln2, idx) => idx === i ? { ...ln2, productId: id, label: lbl ?? '' } : ln2))}
                        placeholder="Search products…" labelKey="name" subLabelKey="sku" allowClear={false} />
                    </div>
                    <Input type="number" value={ln.rate} onChange={e => setLine(i, 'rate', e.target.value)}
                      placeholder="0.00" className="text-right" />
                    <button type="button" onClick={() => removeLine(i)}
                      className="flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors ml-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </AdminLayout>
  );
}
