'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Select } from '@components/ui/select';
import { Dialog } from '@components/ui/dialog';
import StatusBadge from '@components/shared/StatusBadge';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { TableSkeleton } from '@components/ui/skeleton';
import RegularizationApprovalForm from '@components/forms/RegularizationApprovalForm';
import { useRegularizations } from '@/hooks/useRegularizations';
import { usePagination } from '@/hooks/usePagination';
import type { RegularizationRequest, Employee } from '@/types/api';

const TYPE_LABELS: Record<string, string> = {
  forgotCheckIn: 'Forgot Check-in', forgotCheckOut: 'Forgot Check-out',
  workAwayFromOffice: 'WFH', officialTravel: 'Official Travel', clientVisit: 'Client Visit',
};

function empName(r: RegularizationRequest) {
  if (typeof r.employeeId === 'object' && r.employeeId !== null) {
    const e = r.employeeId as Employee; return `${e.firstName} ${e.lastName}`;
  }
  return String(r.employeeId);
}

export default function RegularizationsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<{ reg: RegularizationRequest; action: 'approve' | 'reject' } | null>(null);

  const status = params.get('status') ?? '';
  const type   = params.get('type') ?? '';
  const query  = buildQuery({ status: status || undefined, type: type || undefined });
  const { regularizations, pagination, isLoading, refresh } = useRegularizations(query);

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString()); if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1'); router.push(`/regularization?${sp.toString()}`);
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Regularization' }]}>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Regularization Requests</h1>
        <div className="flex gap-3">
          <Select value={status} onChange={e => updateParam('status', e.target.value)} className="w-40">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </Select>
          <Select value={type} onChange={e => updateParam('type', e.target.value)} className="w-48">
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'Date', 'Type', 'Reason', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={6} /> : regularizations.length === 0 ? (
              <tbody><tr><td colSpan={6}>
                <EmptyState title="No regularization requests" filtered={!!status || !!type} onClearFilters={() => router.push('/regularization')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {regularizations.map(reg => (
                  <tr key={reg._id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/regularization/${reg._id}`)}>
                    <td className="px-4 py-3 font-medium text-gray-900">{empName(reg)}</td>
                    <td className="px-4 py-3 text-gray-600">{format(parseISO(reg.date), 'dd MMM yy')}</td>
                    <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[reg.type] ?? reg.type}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{reg.reason}</td>
                    <td className="px-4 py-3"><StatusBadge status={reg.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {reg.status === 'pending' && (
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button size="sm" onClick={() => setModal({ reg, action: 'approve' })}>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => setModal({ reg, action: 'reject' })}>Reject</Button>
                        </div>
                      )}
                    </td>
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

      {modal && (
        <Dialog open title={modal.action === 'approve' ? 'Approve Regularization' : 'Reject Regularization'} onClose={() => setModal(null)}>
          <RegularizationApprovalForm reg={modal.reg} action={modal.action} onSuccess={() => { setModal(null); refresh(); }} />
        </Dialog>
      )}
    </AdminLayout>
  );
}
