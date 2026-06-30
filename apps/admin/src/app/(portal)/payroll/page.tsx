'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import StatusBadge from '@components/shared/StatusBadge';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { TableSkeleton } from '@components/ui/skeleton';
import PayrollComputeModal from '@components/payroll/PayrollComputeModal';
import PayrollFinalizeModal from '@components/payroll/PayrollFinalizeModal';
import PayrollUnfinalizeModal from '@components/payroll/PayrollUnfinalizeModal';
import PayrollReopenWizard from '@components/payroll/PayrollReopenWizard';
import { usePayroll } from '@/hooks/usePayroll';
import { usePagination } from '@/hooks/usePagination';
import type { PayrollRecord, Employee } from '@/types/api';

function empName(r: PayrollRecord) {
  if (typeof r.employeeId === 'object' && r.employeeId !== null) {
    const e = r.employeeId as Employee; return `${e.firstName} ${e.lastName}`;
  }
  return String(r.employeeId);
}

function fmt(n: number) { return new Intl.NumberFormat('en-IN').format(n); }

type ModalState =
  | { type: 'compute' }
  | { type: 'finalize'; record: PayrollRecord }
  | { type: 'unfinalize'; record: PayrollRecord }
  | { type: 'reopen'; record: PayrollRecord }
  | null;

export default function PayrollPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);
  const [modal, setModal] = useState<ModalState>(null);

  const yearMonth = params.get('yearMonth') ?? '';
  const status    = params.get('status') ?? '';
  const query     = buildQuery({ yearMonth: yearMonth || undefined, status: status || undefined });
  const { payroll, pagination, isLoading, refresh } = usePayroll(query);

  const staleRecords = payroll.filter(r => r.isStale);

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/payroll?${sp.toString()}`);
  };

  const defaultYearMonth = format(new Date(), 'yyyy-MM');

  return (
    <AdminLayout breadcrumb={[{ label: 'Payroll' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Payroll</h1>
          <Button onClick={() => setModal({ type: 'compute' })}>Run Payroll</Button>
        </div>

        {/* Stale Banner */}
        {staleRecords.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">Payroll Conflict Detected</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {staleRecords.length} payroll record{staleRecords.length !== 1 ? 's are' : ' is'} stale due to leave revocations after finalization.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
              onClick={() => staleRecords[0] && setModal({ type: 'reopen', record: staleRecords[0] })}
            >
              Unfinalize &amp; Fix →
            </Button>
          </div>
        )}

        <div className="flex gap-3">
          <Input type="month" value={yearMonth} onChange={e => updateParam('yearMonth', e.target.value)} className="w-44" />
          <Select value={status} onChange={e => updateParam('status', e.target.value)} className="w-36">
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="finalised">Finalised</option>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'Month', 'Present', 'LOP', 'Gross', 'Net', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : payroll.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="No payroll records" filtered={!!(yearMonth || status)} onClearFilters={() => router.push('/payroll')} />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {payroll.map(r => (
                  <tr
                    key={r.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/payroll/${r.yearMonth}/${r.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {empName(r)}
                      {r.isStale && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3" /> Stale
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.yearMonth}</td>
                    <td className="px-4 py-3 text-gray-600">{r.presentDays}</td>
                    <td className="px-4 py-3 text-gray-600">{r.lopDays}</td>
                    <td className="px-4 py-3 text-gray-900">{fmt(r.grossSalary)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmt(r.netSalary)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {r.isStale && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => setModal({ type: 'reopen', record: r })}
                          >
                            Fix
                          </Button>
                        )}
                        {r.status === 'draft' && (
                          <Button size="sm" onClick={() => setModal({ type: 'finalize', record: r })}>
                            Finalise
                          </Button>
                        )}
                        {r.status === 'finalised' && !r.isStale && (
                          <Button size="sm" variant="outline" onClick={() => setModal({ type: 'unfinalize', record: r })}>
                            Unfinalize
                          </Button>
                        )}
                      </div>
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

      {modal?.type === 'compute' && (
        <PayrollComputeModal
          open
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); refresh(); }}
          defaultYearMonth={yearMonth || defaultYearMonth}
        />
      )}
      {modal?.type === 'finalize' && (
        <PayrollFinalizeModal
          open
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); refresh(); }}
          payrollId={modal.record.id}
          yearMonth={modal.record.yearMonth}
          employeeName={empName(modal.record)}
        />
      )}
      {modal?.type === 'unfinalize' && (
        <PayrollUnfinalizeModal
          open
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); refresh(); }}
          payrollId={modal.record.id}
          yearMonth={modal.record.yearMonth}
          employeeName={empName(modal.record)}
        />
      )}
      {modal?.type === 'reopen' && (
        <PayrollReopenWizard
          open
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); refresh(); }}
          payrollId={modal.record.id}
          yearMonth={modal.record.yearMonth}
          employeeName={empName(modal.record)}
        />
      )}
    </AdminLayout>
  );
}
