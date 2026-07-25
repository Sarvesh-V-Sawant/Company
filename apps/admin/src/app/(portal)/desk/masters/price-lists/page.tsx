'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, List } from 'lucide-react';
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
import { apiFetch } from '@lib/utils/api-client';
import { usePagination } from '@/hooks/usePagination';

interface PriceListItem { productId: string; rate: number }
interface PriceList {
  _id: string; manufacturerId: { _id: string; code: string; name: string } | string;
  canteenId?: { _id: string; code: string; name: string } | string;
  effectiveFrom: string; effectiveTo?: string; items: PriceListItem[]; isActive: boolean;
}
interface ApiResp { success: boolean; data: PriceList[]; pagination: { page: number; limit: number; total: number; pages: number } }

type ModalState = null | { mode: 'create' } | { mode: 'edit'; pl: PriceList };
const emptyForm = { manufacturerId: '', canteenId: '', effectiveFrom: '', effectiveTo: '', itemsText: '' };

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
  const [saving, setSaving] = useState(false);

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

  const openCreate = () => { setForm(emptyForm); setModal({ mode: 'create' }); };
  const openEdit   = (pl: PriceList) => {
    setForm({ manufacturerId: typeof pl.manufacturerId === 'object' ? pl.manufacturerId._id : String(pl.manufacturerId), canteenId: pl.canteenId ? (typeof pl.canteenId === 'object' ? pl.canteenId._id : String(pl.canteenId)) : '', effectiveFrom: pl.effectiveFrom.slice(0, 10), effectiveTo: pl.effectiveTo?.slice(0, 10) ?? '', itemsText: pl.items.map(i => `${i.productId}:${i.rate}`).join('\n') });
    setModal({ mode: 'edit', pl });
  };

  const parseItems = (text: string): { productId: string; rate: number }[] =>
    text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [pid, r] = l.split(':');
      return { productId: pid.trim(), rate: Number(r) };
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      const priceItems = parseItems(form.itemsText);
      if (!priceItems.length) { toast.error('Add at least one item (productId:rate)'); setSaving(false); return; }
      const body = { effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined, items: priceItems };
      if (modal?.mode === 'create') {
        await apiFetch('/api/v1/ops/price-lists', { method: 'POST', body: JSON.stringify({ ...body, manufacturerId: form.manufacturerId, canteenId: form.canteenId || undefined }) });
        toast.success('Price list created');
      } else if (modal?.mode === 'edit') {
        await apiFetch(`/api/v1/ops/price-lists/${modal.pl._id}`, { method: 'PATCH', body: JSON.stringify(body) });
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
                        <Button variant="ghost" size="sm" onClick={() => openEdit(pl)}>Edit</Button>
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

      <Dialog open={modal !== null} onClose={() => setModal(null)} title={modal?.mode === 'create' ? 'Add Price List' : 'Edit Price List'} width="max-w-[560px]"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>}>
        <div className="space-y-3">
          {modal?.mode === 'create' && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Manufacturer ID *</label>
                <Input value={form.manufacturerId} onChange={e => setForm(p => ({ ...p, manufacturerId: e.target.value }))} placeholder="MongoDB ObjectId" /></div>
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Canteen ID (optional)</label>
                <Input value={form.canteenId} onChange={e => setForm(p => ({ ...p, canteenId: e.target.value }))} placeholder="Leave blank for all canteens" /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Effective From *</label>
              <Input type="date" value={form.effectiveFrom} onChange={e => setForm(p => ({ ...p, effectiveFrom: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Effective To</label>
              <Input type="date" value={form.effectiveTo} onChange={e => setForm(p => ({ ...p, effectiveTo: e.target.value }))} /></div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Items *</label>
            <p className="text-xs text-gray-400 mb-1">One per line: <code>productObjectId:rate</code></p>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.itemsText} onChange={e => setForm(p => ({ ...p, itemsText: e.target.value }))}
              placeholder={'686abc123def456789012345:150.00\n686abc123def456789012346:220.00'} />
          </div>
        </div>
      </Dialog>
    </AdminLayout>
  );
}
