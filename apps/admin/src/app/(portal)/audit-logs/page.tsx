'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Search } from 'lucide-react';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Input } from '@components/ui/input';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { TableSkeleton } from '@components/ui/skeleton';
import { usePagination } from '@/hooks/usePagination';
import { apiFetch } from '@lib/utils/api-client';

interface AuditLog {
  _id: string;
  userId?: { firstName: string; lastName: string; email: string } | string;
  action: string;
  entity: string;
  entityId?: string;
  ip?: string;
  createdAt: string;
}
interface Res { success: boolean; data: AuditLog[]; pagination: { total: number; totalPages: number } }

let _d: ReturnType<typeof setTimeout> | null = null;

export default function AuditLogsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);

  const search   = params.get('search') ?? '';
  const action   = params.get('action') ?? '';
  const entity   = params.get('entity') ?? '';
  const dateFrom = params.get('dateFrom') ?? '';
  const dateTo   = params.get('dateTo') ?? '';

  const query = buildQuery({ search: search || undefined, action: action || undefined, entity: entity || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
  const { data, isLoading } = useSWR(`/api/v1/audit-logs?${query}`, (url: string) => apiFetch<Res>(url));
  const logs       = data?.data       ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/audit-logs?${sp.toString()}`);
  };

  const userLabel = (log: AuditLog) => {
    if (typeof log.userId === 'object' && log.userId !== null) {
      const u = log.userId as { firstName: string; lastName: string };
      return `${u.firstName} ${u.lastName}`;
    }
    return String(log.userId ?? '—');
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Audit Logs' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Audit Logs</h1>

        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-8 w-48" placeholder="Search…" defaultValue={search}
              onChange={e => { if (_d) clearTimeout(_d); _d = setTimeout(() => updateParam('search', e.target.value), 400); }} />
          </div>
          <Input placeholder="Action" defaultValue={action} className="w-36"
            onChange={e => { if (_d) clearTimeout(_d); _d = setTimeout(() => updateParam('action', e.target.value), 400); }} />
          <Input placeholder="Entity" defaultValue={entity} className="w-36"
            onChange={e => { if (_d) clearTimeout(_d); _d = setTimeout(() => updateParam('entity', e.target.value), 400); }} />
          <Input type="date" value={dateFrom} onChange={e => updateParam('dateFrom', e.target.value)} className="w-40" />
          <Input type="date" value={dateTo}   onChange={e => updateParam('dateTo',   e.target.value)} className="w-40" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['User', 'Action', 'Entity', 'Entity ID', 'IP', 'Date'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={6} /> : logs.length === 0 ? (
              <tbody><tr><td colSpan={6}>
                <EmptyState title="No audit logs found" filtered={!!(search || action || entity || dateFrom || dateTo)} onClearFilters={() => router.push('/audit-logs')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {logs.map(log => (
                  <tr key={log._id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/audit-logs/${log._id}`)}>
                    <td className="px-4 py-3 text-gray-900 font-medium">{userLabel(log)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{log.action}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{log.entity}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.entityId ? log.entityId.slice(-8) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.ip ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{format(parseISO(log.createdAt), 'dd MMM yy HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {pagination && pagination.totalPages > 1 && (
            <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} limit={limit} onPageChange={setPage} />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
