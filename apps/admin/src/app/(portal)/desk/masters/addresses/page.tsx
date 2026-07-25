'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, MapPin } from 'lucide-react';
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
import { apiFetch } from '@lib/utils/api-client';
import { usePagination } from '@/hooks/usePagination';

interface OpsAddress {
  _id: string; ownerType: 'canteen' | 'manufacturer' | 'company'; ownerId: string;
  label: string; addressType: 'shipTo' | 'billTo' | 'both';
  line1: string; city: string; state: string; pincode: string;
  isDefault: boolean; isActive: boolean;
}
interface ApiResp { success: boolean; data: OpsAddress[]; pagination: { page: number; limit: number; total: number; pages: number } }

let _debounce: ReturnType<typeof setTimeout> | null = null;
type ModalState = null | { mode: 'create' } | { mode: 'edit'; address: OpsAddress };
const emptyForm = { ownerType: 'canteen' as OpsAddress['ownerType'], ownerId: '', label: '', addressType: 'shipTo' as OpsAddress['addressType'], line1: '', line2: '', city: '', state: '', stateCode: '', pincode: '', gstin: '', isDefault: false };

export default function AddressesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const search     = params.get('search') ?? '';
  const ownerType  = params.get('ownerType') ?? '';
  const active     = params.get('isActive') ?? '';
  const query      = buildQuery({ search: search || undefined, ownerType: ownerType || undefined, isActive: active || undefined });

  const { data, isLoading, mutate } = useSWR<ApiResp>(`/api/v1/ops/addresses?${query}`, (url: string) => apiFetch<ApiResp>(url));
  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/masters/addresses?${sp.toString()}`);
  };

  const openCreate = () => { setForm(emptyForm); setModal({ mode: 'create' }); };
  const openEdit   = (a: OpsAddress) => {
    setForm({ ownerType: a.ownerType, ownerId: a.ownerId, label: a.label, addressType: a.addressType, line1: a.line1, line2: '', city: a.city, state: a.state, stateCode: '', pincode: a.pincode, gstin: '', isDefault: a.isDefault });
    setModal({ mode: 'edit', address: a });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { ...form, gstin: form.gstin || undefined };
      if (modal?.mode === 'create') {
        await apiFetch('/api/v1/ops/addresses', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Address created');
      } else if (modal?.mode === 'edit') {
        const { ownerType: _ot, ownerId: _oid, ...updateBody } = body;
        await apiFetch(`/api/v1/ops/addresses/${modal.address._id}`, { method: 'PATCH', body: JSON.stringify(updateBody) });
        toast.success('Address updated');
      }
      setModal(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleStatus = async (a: OpsAddress) => {
    try {
      await apiFetch(`/api/v1/ops/addresses/${a._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !a.isActive }) });
      toast.success(`Address ${!a.isActive ? 'activated' : 'deactivated'}`);
      mutate();
    } catch { toast.error('Status update failed'); }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Addresses' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Address Master</h1>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Address</Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-8" placeholder="Search label or city…" defaultValue={search}
              onChange={e => { if (_debounce) clearTimeout(_debounce); _debounce = setTimeout(() => updateParam('search', e.target.value), 400); }} />
          </div>
          <Select value={ownerType} onChange={e => updateParam('ownerType', e.target.value)} className="w-40">
            <option value="">All Owners</option>
            <option value="canteen">Canteen</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="company">Company</option>
          </Select>
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
                {['Label', 'Owner Type', 'Type', 'City / State', 'Pincode', 'Default', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={8} /> : items.length === 0 ? (
              <tbody><tr><td colSpan={8}>
                <EmptyState icon={MapPin} title="No addresses found" action={{ label: 'Add Address', onClick: openCreate }}
                  filtered={!!(search || ownerType || active)} onClearFilters={() => router.push('/desk/masters/addresses')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {items.map(a => (
                  <tr key={a._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.label}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{a.ownerType}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{a.addressType}</td>
                    <td className="px-4 py-3 text-gray-500">{a.city}, {a.state}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.pincode}</td>
                    <td className="px-4 py-3">{a.isDefault ? <span className="text-xs font-medium text-blue-600">Default</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(a)}>{a.isActive ? 'Deactivate' : 'Activate'}</Button>
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

      <Dialog open={modal !== null} onClose={() => setModal(null)} title={modal?.mode === 'create' ? 'Add Address' : 'Edit Address'} width="max-w-[560px]"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>}>
        <div className="space-y-3">
          {modal?.mode === 'create' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Owner Type *</label>
                  <Select value={form.ownerType} onChange={e => setForm(p => ({ ...p, ownerType: e.target.value as OpsAddress['ownerType'] }))} className="w-full">
                    <option value="canteen">Canteen</option>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="company">Company</option>
                  </Select></div>
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Owner ID *</label>
                  <Input value={form.ownerId} onChange={e => setForm(p => ({ ...p, ownerId: e.target.value }))} placeholder="MongoDB ObjectId" /></div>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Label *</label>
              <Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Head Office" /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Address Type *</label>
              <Select value={form.addressType} onChange={e => setForm(p => ({ ...p, addressType: e.target.value as OpsAddress['addressType'] }))} className="w-full">
                <option value="shipTo">Ship To</option>
                <option value="billTo">Bill To</option>
                <option value="both">Both</option>
              </Select></div>
          </div>
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Line 1 *</label>
            <Input value={form.line1} onChange={e => setForm(p => ({ ...p, line1: e.target.value }))} /></div>
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Line 2</label>
            <Input value={form.line2} onChange={e => setForm(p => ({ ...p, line2: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-sm font-medium text-gray-700 block mb-1">City *</label>
              <Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">State *</label>
              <Input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">State Code *</label>
              <Input value={form.stateCode} onChange={e => setForm(p => ({ ...p, stateCode: e.target.value.toUpperCase() }))} placeholder="MH" maxLength={2} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Pincode *</label>
              <Input value={form.pincode} onChange={e => setForm(p => ({ ...p, pincode: e.target.value }))} placeholder="6 digits" /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">GSTIN</label>
              <Input value={form.gstin} onChange={e => setForm(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))} className="rounded" />
            Set as default for this owner + type
          </label>
        </div>
      </Dialog>
    </AdminLayout>
  );
}
