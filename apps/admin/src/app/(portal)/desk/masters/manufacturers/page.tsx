'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Factory } from 'lucide-react';
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

interface Manufacturer {
  _id: string; code: string; name: string; gstin?: string;
  primaryEmail: string; phone?: string; contactPerson?: string; isActive: boolean;
}
interface ApiResp { success: boolean; data: Manufacturer[]; pagination: { page: number; limit: number; total: number; pages: number } }

let _debounce: ReturnType<typeof setTimeout> | null = null;
type ModalState = null | { mode: 'create' } | { mode: 'edit'; id: string };
const emptyForm = { code: '', name: '', gstin: '', primaryEmail: '', contactPerson: '', phone: '' };

export default function ManufacturersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const search = params.get('search') ?? '';
  const active = params.get('isActive') ?? '';
  const query  = buildQuery({ search: search || undefined, isActive: active || undefined });

  const { data, isLoading, mutate } = useSWR<ApiResp>(`/api/v1/ops/manufacturers?${query}`, (url: string) => apiFetch<ApiResp>(url));
  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/masters/manufacturers?${sp.toString()}`);
  };

  const openCreate = () => { setForm(emptyForm); setModal({ mode: 'create' }); };
  const openEdit = async (id: string) => {
    setModal({ mode: 'edit', id });
    setLoadingRecord(true);
    try {
      const res = await apiFetch<{ success: boolean; data: Manufacturer }>(`/api/v1/ops/manufacturers/${id}`);
      const m = res.data;
      setForm({ code: m.code, name: m.name, gstin: m.gstin ?? '', primaryEmail: m.primaryEmail, contactPerson: m.contactPerson ?? '', phone: m.phone ?? '' });
    } catch { toast.error('Failed to load manufacturer details'); setModal(null); }
    finally { setLoadingRecord(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modal?.mode === 'create') {
        await apiFetch('/api/v1/ops/manufacturers', { method: 'POST', body: JSON.stringify({ ...form, gstin: form.gstin || undefined }) });
        toast.success('Manufacturer created');
      } else if (modal?.mode === 'edit') {
        await apiFetch(`/api/v1/ops/manufacturers/${modal.id}`, { method: 'PATCH', body: JSON.stringify({ name: form.name, gstin: form.gstin || undefined, primaryEmail: form.primaryEmail, contactPerson: form.contactPerson || undefined, phone: form.phone || undefined }) });
        toast.success('Manufacturer updated');
      }
      setModal(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleStatus = async (m: Manufacturer) => {
    try {
      await apiFetch(`/api/v1/ops/manufacturers/${m._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !m.isActive }) });
      toast.success(`Manufacturer ${!m.isActive ? 'activated' : 'deactivated'}`);
      mutate();
    } catch { toast.error('Status update failed'); }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Manufacturers' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Manufacturer Master</h1>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Manufacturer</Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-8" placeholder="Search code or name…" defaultValue={search}
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
                {['Code', 'Name', 'GSTIN', 'Primary Email', 'Phone', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={7} /> : items.length === 0 ? (
              <tbody><tr><td colSpan={7}>
                <EmptyState icon={Factory} title="No manufacturers found" action={{ label: 'Add Manufacturer', onClick: openCreate }}
                  filtered={!!(search || active)} onClearFilters={() => router.push('/desk/masters/manufacturers')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {items.map(m => (
                  <tr key={m._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{m.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.gstin ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{m.primaryEmail}</td>
                    <td className="px-4 py-3 text-gray-500">{m.phone ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(m._id)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(m)}>{m.isActive ? 'Deactivate' : 'Activate'}</Button>
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

      <Dialog open={modal !== null} onClose={() => setModal(null)} title={modal?.mode === 'create' ? 'Add Manufacturer' : 'Edit Manufacturer'}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button onClick={handleSave} disabled={saving || loadingRecord}>{saving ? 'Saving…' : 'Save'}</Button></div>}>
        {loadingRecord ? <div className="py-8 text-center text-sm text-gray-400">Loading…</div> : <div className="space-y-3">
          {modal?.mode === 'create' && (
            <div><label className="text-sm font-medium text-gray-700 block mb-1">Code *</label>
              <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. MFR001" /></div>
          )}
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Name *</label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Manufacturer name" /></div>
          <div><label className="text-sm font-medium text-gray-700 block mb-1">GSTIN</label>
            <Input value={form.gstin} onChange={e => setForm(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} placeholder="22ABCDE1234F1Z5" /></div>
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Primary Email *</label>
            <Input type="email" value={form.primaryEmail} onChange={e => setForm(p => ({ ...p, primaryEmail: e.target.value }))} /></div>
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Contact Person</label>
            <Input value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} /></div>
          <div><label className="text-sm font-medium text-gray-700 block mb-1">Phone</label>
            <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
        </div>}
      </Dialog>
    </AdminLayout>
  );
}
