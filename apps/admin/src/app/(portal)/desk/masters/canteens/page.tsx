'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Building2 } from 'lucide-react';
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

interface Canteen {
  _id: string; code: string; name: string; type: 'main' | 'subsidiary';
  parentCanteenId?: string;
  parentCanteen?: { _id: string; code: string; name: string };
  subsidiaryCount?: number; gstin?: string; contactPerson?: string; phone?: string; email?: string; isActive: boolean;
}
interface ApiResp { success: boolean; data: Canteen[]; pagination: { page: number; limit: number; total: number; pages: number } }

let _debounce: ReturnType<typeof setTimeout> | null = null;
type ModalState = null | { mode: 'create' } | { mode: 'edit'; id: string };

const emptyForm = {
  code: '', name: '', type: 'main' as 'main' | 'subsidiary',
  parentCanteenId: '', gstin: '', contactPerson: '', phone: '', email: '',
};

export default function CanteensPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const search = params.get('search') ?? '';
  const type   = params.get('type') ?? '';
  const active = params.get('isActive') ?? '';
  const query  = buildQuery({ search: search || undefined, type: type || undefined, isActive: active || undefined });

  const { data, isLoading, mutate } = useSWR<ApiResp>(`/api/v1/ops/canteens?${query}`, (url: string) => apiFetch<ApiResp>(url));
  const canteens = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/masters/canteens?${sp.toString()}`);
  };

  const openCreate = () => { setForm(emptyForm); setModal({ mode: 'create' }); };

  const openEdit = async (id: string) => {
    setModal({ mode: 'edit', id });
    setLoadingRecord(true);
    try {
      const res = await apiFetch<{ success: boolean; data: Canteen }>(`/api/v1/ops/canteens/${id}`);
      const c = res.data;
      setForm({
        code: c.code, name: c.name, type: c.type,
        parentCanteenId: String(c.parentCanteenId ?? ''),
        gstin: c.gstin ?? '', contactPerson: c.contactPerson ?? '',
        phone: c.phone ?? '', email: c.email ?? '',
      });
    } catch { toast.error('Failed to load canteen details'); setModal(null); }
    finally { setLoadingRecord(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modal?.mode === 'create') {
        await apiFetch('/api/v1/ops/canteens', { method: 'POST', body: JSON.stringify({
          code: form.code, name: form.name, type: form.type,
          parentCanteenId: form.parentCanteenId || undefined,
          gstin: form.gstin || undefined, contactPerson: form.contactPerson || undefined,
          phone: form.phone || undefined, email: form.email || undefined,
        }) });
        toast.success('Canteen created');
      } else if (modal?.mode === 'edit') {
        await apiFetch(`/api/v1/ops/canteens/${modal.id}`, { method: 'PATCH', body: JSON.stringify({
          name: form.name, gstin: form.gstin || undefined,
          contactPerson: form.contactPerson || undefined,
          phone: form.phone || undefined, email: form.email || undefined,
        }) });
        toast.success('Canteen updated');
      }
      setModal(null);
      mutate();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (c: Canteen) => {
    try {
      await apiFetch(`/api/v1/ops/canteens/${c._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !c.isActive }) });
      toast.success(`Canteen ${!c.isActive ? 'activated' : 'deactivated'}`);
      mutate();
    } catch { toast.error('Status update failed'); }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Canteens' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Canteen Master</h1>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Canteen</Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-8" placeholder="Search code or name…" defaultValue={search}
              onChange={e => { if (_debounce) clearTimeout(_debounce); _debounce = setTimeout(() => updateParam('search', e.target.value), 400); }} />
          </div>
          <Select value={type} onChange={e => updateParam('type', e.target.value)} className="w-36">
            <option value="">All Types</option>
            <option value="main">Main</option>
            <option value="subsidiary">Subsidiary</option>
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
                {['Code', 'Name', 'Type', 'Parent / Subsidiaries', 'Contact', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={7} /> : canteens.length === 0 ? (
              <tbody><tr><td colSpan={7}>
                <EmptyState icon={Building2} title="No canteens found" action={{ label: 'Add Canteen', onClick: openCreate }}
                  filtered={!!(search || type || active)} onClearFilters={() => router.push('/desk/masters/canteens')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {canteens.map(c => (
                  <tr key={c._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{c.type}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.type === 'subsidiary' ? (c.parentCanteen ? `${c.parentCanteen.code} – ${c.parentCanteen.name}` : '—') : `${c.subsidiaryCount ?? 0} sub`}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.phone ?? c.email ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c._id)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(c)}>{c.isActive ? 'Deactivate' : 'Activate'}</Button>
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
        title={modal?.mode === 'create' ? 'Add Canteen' : 'Edit Canteen'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || loadingRecord}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        }>
        {loadingRecord ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="space-y-3">
            {modal?.mode === 'create' && (
              <>
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Code *</label>
                  <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. CNT001" /></div>
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Type *</label>
                  <Select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as 'main' | 'subsidiary', parentCanteenId: '' }))} className="w-full">
                    <option value="main">Main</option>
                    <option value="subsidiary">Subsidiary</option>
                  </Select></div>
                {form.type === 'subsidiary' && (
                  <div><label className="text-sm font-medium text-gray-700 block mb-1">Parent Canteen *</label>
                    <EntityPicker
                      endpoint="/api/v1/ops/canteens"
                      value={form.parentCanteenId}
                      onChange={(id) => setForm(p => ({ ...p, parentCanteenId: id }))}
                      placeholder="Search main canteens…"
                      extraQuery={{ type: 'main' }}
                    /></div>
                )}
              </>
            )}
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Name *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Canteen name" /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">GSTIN</label>
              <Input value={form.gstin} onChange={e => setForm(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} placeholder="22ABCDE1234F1Z5" /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Contact Person</label>
              <Input value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Phone</label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
        )}
      </Dialog>
    </AdminLayout>
  );
}
