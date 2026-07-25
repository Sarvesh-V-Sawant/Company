'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Package } from 'lucide-react';
import { toast } from 'sonner';
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

interface Product {
  _id: string; sku: string; name: string; uom: string; packSize?: number;
  hsnCode?: string; gstRatePercent?: number; isActive: boolean;
  manufacturerId: { _id: string; code: string; name: string } | string;
}
interface ApiResp { success: boolean; data: Product[]; pagination: { page: number; limit: number; total: number; pages: number } }

let _debounce: ReturnType<typeof setTimeout> | null = null;
type ModalState = null | { mode: 'create' } | { mode: 'edit'; id: string };
const emptyForm = { sku: '', name: '', manufacturerId: '', uom: 'PCS', packSize: '', hsnCode: '', gstRatePercent: '' };

export default function ProductsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const search = params.get('search') ?? '';
  const active = params.get('isActive') ?? '';
  const mfrId  = params.get('manufacturerId') ?? '';
  const query  = buildQuery({ search: search || undefined, isActive: active || undefined, manufacturerId: mfrId || undefined });

  const { data, isLoading, mutate } = useSWR<ApiResp>(`/api/v1/ops/products?${query}`, (url: string) => apiFetch<ApiResp>(url));
  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/masters/products?${sp.toString()}`);
  };

  const mfrName = (p: Product) => {
    if (typeof p.manufacturerId === 'object' && p.manufacturerId !== null) return `${p.manufacturerId.code} – ${p.manufacturerId.name}`;
    return String(p.manufacturerId);
  };

  const openCreate = () => { setForm(emptyForm); setModal({ mode: 'create' }); };
  const openEdit = async (id: string) => {
    setModal({ mode: 'edit', id });
    setLoadingRecord(true);
    try {
      const res = await apiFetch<{ success: boolean; data: Product }>(`/api/v1/ops/products/${id}`);
      const p = res.data;
      setForm({ sku: p.sku, name: p.name, manufacturerId: typeof p.manufacturerId === 'object' ? p.manufacturerId._id : String(p.manufacturerId), uom: p.uom, packSize: p.packSize != null ? String(p.packSize) : '', hsnCode: p.hsnCode ?? '', gstRatePercent: p.gstRatePercent != null ? String(p.gstRatePercent) : '' });
    } catch { toast.error('Failed to load product details'); setModal(null); }
    finally { setLoadingRecord(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        uom: form.uom,
        packSize: form.packSize ? Number(form.packSize) : undefined,
        hsnCode: form.hsnCode || undefined,
        gstRatePercent: form.gstRatePercent ? Number(form.gstRatePercent) : undefined,
      };
      if (modal?.mode === 'create') {
        await apiFetch('/api/v1/ops/products', { method: 'POST', body: JSON.stringify({ ...payload, sku: form.sku, manufacturerId: form.manufacturerId }) });
        toast.success('Product created');
      } else if (modal?.mode === 'edit') {
        await apiFetch(`/api/v1/ops/products/${modal.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success('Product updated');
      }
      setModal(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleStatus = async (p: Product) => {
    try {
      await apiFetch(`/api/v1/ops/products/${p._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !p.isActive }) });
      toast.success(`Product ${!p.isActive ? 'activated' : 'deactivated'}`);
      mutate();
    } catch { toast.error('Status update failed'); }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Products' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Product / SKU Master</h1>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Product</Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-8" placeholder="Search SKU or name…" defaultValue={search}
              onChange={e => { if (_debounce) clearTimeout(_debounce); _debounce = setTimeout(() => updateParam('search', e.target.value), 400); }} />
          </div>
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
                {['SKU', 'Name', 'Manufacturer', 'UOM', 'HSN', 'GST %', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={8} /> : items.length === 0 ? (
              <tbody><tr><td colSpan={8}>
                <EmptyState icon={Package} title="No products found" action={{ label: 'Add Product', onClick: openCreate }}
                  filtered={!!(search || active || mfrId)} onClearFilters={() => router.push('/desk/masters/products')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {items.map(p => (
                  <tr key={p._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{mfrName(p)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.uom}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.hsnCode ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.gstRatePercent != null ? `${p.gstRatePercent}%` : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p._id)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(p)}>{p.isActive ? 'Deactivate' : 'Activate'}</Button>
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

      <Dialog open={modal !== null} onClose={() => setModal(null)} title={modal?.mode === 'create' ? 'Add Product' : 'Edit Product'}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button onClick={handleSave} disabled={saving || loadingRecord}>{saving ? 'Saving…' : 'Save'}</Button></div>}>
        {loadingRecord ? <div className="py-8 text-center text-sm text-gray-400">Loading…</div> : <div className="space-y-3">
          {modal?.mode === 'create' && (
            <>
              <div><label className="text-sm font-medium text-gray-700 block mb-1">SKU *</label>
                <Input value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value.toUpperCase() }))} placeholder="e.g. PROD001" /></div>
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Manufacturer *</label>
                <EntityPicker endpoint="/api/v1/ops/manufacturers" value={form.manufacturerId}
                  onChange={id => setForm(p => ({ ...p, manufacturerId: id }))} placeholder="Search manufacturers…" /></div>
            </>
          )}
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Name *</label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Product name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-gray-700 block mb-1">UOM *</label>
              <Input value={form.uom} onChange={e => setForm(p => ({ ...p, uom: e.target.value.toUpperCase() }))} placeholder="PCS, KG, LTR…" /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Pack Size</label>
              <Input type="number" value={form.packSize} onChange={e => setForm(p => ({ ...p, packSize: e.target.value }))} placeholder="e.g. 12" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-gray-700 block mb-1">HSN Code</label>
              <Input value={form.hsnCode} onChange={e => setForm(p => ({ ...p, hsnCode: e.target.value }))} placeholder="8-digit code" /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">GST Rate %</label>
              <Input type="number" value={form.gstRatePercent} onChange={e => setForm(p => ({ ...p, gstRatePercent: e.target.value }))} placeholder="0–100" /></div>
          </div>
        </div>}
      </Dialog>
    </AdminLayout>
  );
}
