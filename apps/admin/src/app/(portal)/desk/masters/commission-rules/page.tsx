'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Percent } from 'lucide-react';
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

type CommScope = 'manufacturer' | 'product' | 'canteen';
type CommType  = 'percentage' | 'perUnit' | 'flat';

interface CommissionRule {
  _id: string; scope: CommScope; type: CommType; value: number;
  manufacturerId?: { _id: string; code: string; name: string } | string;
  productId?: { _id: string; sku: string; name: string } | string;
  canteenId?: { _id: string; code: string; name: string } | string;
  effectiveFrom: string; effectiveTo?: string;
  gstApplicable?: boolean; sacCode?: string; isActive: boolean;
}
interface ApiResp { success: boolean; data: CommissionRule[]; pagination: { page: number; limit: number; total: number; pages: number } }

type ModalState = null | { mode: 'create' } | { mode: 'edit'; rule: CommissionRule };
const emptyForm = { scope: 'manufacturer' as CommScope, scopeId: '', type: 'percentage' as CommType, value: '', effectiveFrom: '', effectiveTo: '', gstApplicable: false, sacCode: '', notes: '' };

function scopeRef(r: CommissionRule) {
  const ref = r.scope === 'manufacturer' ? r.manufacturerId : r.scope === 'product' ? r.productId : r.canteenId;
  if (!ref) return '—';
  if (typeof ref === 'object') {
    if ('sku' in ref) return `${ref.sku} – ${ref.name}`;
    if ('code' in ref) return `${ref.code} – ${ref.name}`;
  }
  return String(ref);
}

export default function CommissionRulesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const scope  = params.get('scope') ?? '';
  const active = params.get('isActive') ?? '';
  const query  = buildQuery({ scope: scope || undefined, isActive: active || undefined });

  const { data, isLoading, mutate } = useSWR<ApiResp>(`/api/v1/ops/commission-rules?${query}`, (url: string) => apiFetch<ApiResp>(url));
  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/masters/commission-rules?${sp.toString()}`);
  };

  const openCreate = () => { setForm(emptyForm); setModal({ mode: 'create' }); };
  const openEdit   = (r: CommissionRule) => {
    const scopeId = (r.scope === 'manufacturer' ? r.manufacturerId : r.scope === 'product' ? r.productId : r.canteenId);
    const id = typeof scopeId === 'object' && scopeId !== null ? scopeId._id : String(scopeId ?? '');
    setForm({ scope: r.scope, scopeId: id, type: r.type, value: String(r.value), effectiveFrom: r.effectiveFrom.slice(0, 10), effectiveTo: r.effectiveTo?.slice(0, 10) ?? '', gstApplicable: r.gstApplicable ?? false, sacCode: r.sacCode ?? '', notes: '' });
    setModal({ mode: 'edit', rule: r });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modal?.mode === 'create') {
        const body = { scope: form.scope, [`${form.scope}Id`]: form.scopeId, type: form.type, value: Number(form.value), effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || undefined, gstApplicable: form.gstApplicable, sacCode: form.sacCode || undefined };
        await apiFetch('/api/v1/ops/commission-rules', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Commission rule created');
      } else if (modal?.mode === 'edit') {
        await apiFetch(`/api/v1/ops/commission-rules/${modal.rule._id}`, { method: 'PATCH', body: JSON.stringify({ value: Number(form.value), effectiveTo: form.effectiveTo || undefined, gstApplicable: form.gstApplicable, sacCode: form.sacCode || undefined }) });
        toast.success('Commission rule updated');
      }
      setModal(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleStatus = async (r: CommissionRule) => {
    try {
      await apiFetch(`/api/v1/ops/commission-rules/${r._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !r.isActive }) });
      toast.success(`Rule ${!r.isActive ? 'activated' : 'deactivated'}`);
      mutate();
    } catch { toast.error('Status update failed'); }
  };

  const fmt = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; } };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Masters' }, { label: 'Commission Rules' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Commission Rules</h1>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Rule</Button>
        </div>

        <div className="flex gap-3">
          <Select value={scope} onChange={e => updateParam('scope', e.target.value)} className="w-40">
            <option value="">All Scopes</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="product">Product</option>
            <option value="canteen">Canteen</option>
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
                {['Scope', 'Entity', 'Type', 'Value', 'Effective From', 'Effective To', 'GST', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={9} /> : items.length === 0 ? (
              <tbody><tr><td colSpan={9}>
                <EmptyState icon={Percent} title="No commission rules found" action={{ label: 'Add Rule', onClick: openCreate }}
                  filtered={!!(scope || active)} onClearFilters={() => router.push('/desk/masters/commission-rules')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {items.map(r => (
                  <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 capitalize">{r.scope}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{scopeRef(r)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.type}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.type === 'percentage' ? `${r.value}%` : `₹${r.value}`}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(r.effectiveFrom)}</td>
                    <td className="px-4 py-3 text-gray-500">{r.effectiveTo ? fmt(r.effectiveTo) : '—'}</td>
                    <td className="px-4 py-3">{r.gstApplicable ? <span className="text-xs font-medium text-orange-600">GST</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</Button>
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

      <Dialog open={modal !== null} onClose={() => setModal(null)} title={modal?.mode === 'create' ? 'Add Commission Rule' : 'Edit Commission Rule'} width="max-w-[520px]"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>}>
        <div className="space-y-3">
          {modal?.mode === 'create' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Scope *</label>
                  <Select value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value as CommScope }))} className="w-full">
                    <option value="manufacturer">Manufacturer</option>
                    <option value="product">Product</option>
                    <option value="canteen">Canteen</option>
                  </Select></div>
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Scope Entity ID *</label>
                  <Input value={form.scopeId} onChange={e => setForm(p => ({ ...p, scopeId: e.target.value }))} placeholder="MongoDB ObjectId" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Type *</label>
                  <Select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as CommType }))} className="w-full">
                    <option value="percentage">Percentage</option>
                    <option value="perUnit">Per Unit</option>
                    <option value="flat">Flat</option>
                  </Select></div>
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Value *</label>
                  <Input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="e.g. 5 or 50" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Effective From *</label>
                  <Input type="date" value={form.effectiveFrom} onChange={e => setForm(p => ({ ...p, effectiveFrom: e.target.value }))} /></div>
                <div><label className="text-sm font-medium text-gray-700 block mb-1">Effective To</label>
                  <Input type="date" value={form.effectiveTo} onChange={e => setForm(p => ({ ...p, effectiveTo: e.target.value }))} /></div>
              </div>
            </>
          )}
          {modal?.mode === 'edit' && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Value *</label>
                <Input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} /></div>
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Effective To</label>
                <Input type="date" value={form.effectiveTo} onChange={e => setForm(p => ({ ...p, effectiveTo: e.target.value }))} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-gray-700 block mb-1">SAC Code</label>
              <Input value={form.sacCode} onChange={e => setForm(p => ({ ...p, sacCode: e.target.value }))} placeholder="e.g. 996211" /></div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.gstApplicable} onChange={e => setForm(p => ({ ...p, gstApplicable: e.target.checked }))} className="rounded" />
                GST Applicable
              </label>
            </div>
          </div>
        </div>
      </Dialog>
    </AdminLayout>
  );
}
