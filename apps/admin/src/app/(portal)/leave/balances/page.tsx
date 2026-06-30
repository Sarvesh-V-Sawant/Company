'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import Link from 'next/link';
import AdminLayout from '@components/layout/AdminLayout';
import { Input } from '@components/ui/input';
import { TableSkeleton } from '@components/ui/skeleton';
import EmptyState from '@components/shared/EmptyState';
import Pagination from '@components/shared/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { apiFetch } from '@lib/utils/api-client';
import useSWR from 'swr';

interface EmpRef { _id: string; firstName: string; lastName: string; employeeId: string }
interface BalanceItem {
  employeeId: string | EmpRef;
  leaveType: string;
  entitled: number;
  used: number;
  remaining: number;
  carriedForward?: number;
}
interface Res { success: boolean; data: BalanceItem[]; pagination?: { total: number; totalPages: number } }

let _d: ReturnType<typeof setTimeout> | null = null;

export default function LeaveBalancesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const search = params.get('search') ?? '';

  const query = buildQuery({ search: search || undefined });
  const { data, isLoading } = useSWR(
    `/api/v1/leaves/balance?${query}`,
    (url: string) => apiFetch<Res>(url),
  );
  const balances   = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/leave/balances?${sp.toString()}`);
  };

  const empLabel = (b: BalanceItem) => {
    if (typeof b.employeeId === 'object' && b.employeeId !== null) {
      const e = b.employeeId as EmpRef;
      return { name: `${e.firstName} ${e.lastName}`, id: e.employeeId };
    }
    return { name: String(b.employeeId), id: '' };
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Leave', href: '/leave' }, { label: 'Balances' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Leave Balances</h1>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 border-b border-gray-200">
          <Link href="/leave" className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Requests</Link>
          <span className="px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600">Balances</span>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-8 w-56"
              placeholder="Search employee…"
              defaultValue={search}
              onChange={e => {
                if (_d) clearTimeout(_d);
                _d = setTimeout(() => updateParam('search', e.target.value), 400);
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'ID', 'Leave Type', 'Entitled', 'Used', 'Carried Fwd', 'Remaining'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : balances.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="No leave balance data found"
                      filtered={!!search}
                      onClearFilters={() => router.push('/leave/balances')}
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {balances.map((b, i) => {
                  const { name, id } = empLabel(b);
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{id || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{b.leaveType}</td>
                      <td className="px-4 py-3 text-gray-600">{b.entitled}</td>
                      <td className="px-4 py-3 text-red-600">{b.used}</td>
                      <td className="px-4 py-3 text-blue-600">{b.carriedForward ?? 0}</td>
                      <td className="px-4 py-3 font-semibold text-green-700">{b.remaining}</td>
                    </tr>
                  );
                })}
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
