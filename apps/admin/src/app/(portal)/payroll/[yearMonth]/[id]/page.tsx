'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import StatusBadge from '@components/shared/StatusBadge';
import { Skeleton } from '@components/ui/skeleton';
import PayrollFinalizeModal from '@components/payroll/PayrollFinalizeModal';
import PayrollUnfinalizeModal from '@components/payroll/PayrollUnfinalizeModal';
import useSWR from 'swr';
import { apiFetch, apiFetchBlob } from '@lib/utils/api-client';
import type { PayrollRecord } from '@/types/api';

interface Res { success: boolean; data: PayrollRecord }
interface AdjRes { success: boolean; error?: { code: string; message: string } }

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function empName(r: PayrollRecord) {
  const s = r.employeeSnapshot;
  return s ? `${s.firstName} ${s.lastName}` : '—';
}

type Modal = 'finalize' | 'unfinalize' | null;

export default function PayslipDetailPage() {
  const { yearMonth, id } = useParams<{ yearMonth: string; id: string }>();
  const [modal, setModal] = useState<Modal>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjRemark, setAdjRemark] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    `/api/v1/payroll/${id}/${yearMonth}`,
    (url: string) => apiFetch<Res>(url),
  );
  const r = data?.data;

  const handleExport = async () => {
    try {
      const blob = await apiFetchBlob(`/api/v1/payroll/${id}/${yearMonth}/export?format=xlsx`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${yearMonth}-${id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  const handleAdjust = async () => {
    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Deduction amount must be 0 or greater.');
      return;
    }
    if (amount > 0 && !adjRemark.trim()) {
      toast.error('Remark is required when deduction amount is greater than zero.');
      return;
    }
    setAdjLoading(true);
    try {
      const result = await apiFetch<AdjRes>(`/api/v1/payroll/${id}/${yearMonth}/adjust`, {
        method: 'PATCH',
        body: JSON.stringify({ manualDeduction: amount, remark: adjRemark.trim() }),
      });
      if (!result.success) {
        toast.error(result.error?.message ?? 'Failed to update manual deduction.');
        return;
      }
      toast.success('Manual deduction updated.');
      setAdjAmount('');
      setAdjRemark('');
      mutate();
    } catch {
      toast.error('Failed to update manual deduction.');
    } finally {
      setAdjLoading(false);
    }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Payroll', href: '/payroll' }, { label: yearMonth }, { label: 'Payslip' }]}>
      <div className="space-y-4 max-w-3xl">
        <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Payroll
        </Link>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : !r ? (
          <p className="text-sm text-gray-500">Payslip not found.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Payslip — {r.yearMonth}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{empName(r)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1.5" /> Export XLSX
                </Button>
                {r.status === 'draft' && (
                  <Button size="sm" onClick={() => setModal('finalize')}>Finalise</Button>
                )}
                {r.status === 'finalised' && (
                  <Button size="sm" variant="outline" onClick={() => setModal('unfinalize')}>Unfinalize</Button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <StatusBadge status={r.status} />
              </div>

              {/* Attendance summary */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">Attendance Summary</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Working Days', value: r.workingDays },
                    { label: 'Present Days', value: r.presentDays },
                    { label: 'Absent Days',  value: r.absentDays  },
                    { label: 'Leave Days',   value: r.leaveDays   },
                    { label: 'Half Days',    value: r.halfDays    },
                    { label: 'LWP Days',     value: r.lopDays     },
                  ].filter(i => i.value !== undefined).map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Salary breakdown */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">Salary Breakdown</p>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Gross Salary</span>
                  <span className="text-sm text-gray-900">{fmtCurrency(r.grossSalary)}</span>
                </div>
                {r.manualDeduction > 0 && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-600">Manual Deduction</span>
                    <span className="text-sm text-red-600">−{fmtCurrency(r.manualDeduction)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Total Deductions</span>
                  <span className="text-sm text-red-600">−{fmtCurrency(r.deductions)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-100 mt-1">
                  <span className="text-sm font-semibold text-gray-900">Net Salary</span>
                  <span className="text-lg font-bold text-gray-900">{fmtCurrency(r.netSalary)}</span>
                </div>
              </div>

              {/* Deduction breakdown */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">Deduction Breakdown</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Per-day rate</span>
                    <span>{fmtCurrency(r.perDaySalary)}</span>
                  </div>
                  {r.effectiveLwpDays > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>LWP ({r.effectiveLwpDays} day{r.effectiveLwpDays !== 1 ? 's' : ''})</span>
                      <span className="text-red-600">−{fmtCurrency(r.deductionBreakdown.lwpDeduction)}</span>
                    </div>
                  )}
                  {r.absentDays > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Absent ({r.absentDays} day{r.absentDays !== 1 ? 's' : ''})</span>
                      <span className="text-red-600">−{fmtCurrency(r.deductionBreakdown.absentDeduction)}</span>
                    </div>
                  )}
                  {(r.halfDayDeductionDays ?? 0) > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>
                        Half-day attendance ({r.halfDays} half-day{r.halfDays !== 1 ? 's' : ''}
                        {' → '}{r.halfDayDeductionDays} deduction day{(r.halfDayDeductionDays ?? 0) !== 1 ? 's' : ''})
                      </span>
                      <span className="text-red-600">−{fmtCurrency(r.deductionBreakdown.halfDayDeduction ?? 0)}</span>
                    </div>
                  )}
                  {(r.lateMarkCount ?? 0) > 0 && (
                    <div className="flex justify-between text-gray-400 text-xs">
                      <span>Late arrivals (informational)</span>
                      <span>{r.lateMarkCount} day{(r.lateMarkCount ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {r.manualDeduction > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Manual deduction</span>
                      <span className="text-red-600">−{fmtCurrency(r.manualDeduction)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual deduction — draft only */}
              {r.status === 'draft' && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-3">Manual Deduction</p>
                  {r.manualDeduction > 0 && (
                    <p className="text-xs text-gray-500 mb-3">
                      Current: {fmtCurrency(r.manualDeduction)}
                      {r.manualDeductionRemark ? ` — ${r.manualDeductionRemark}` : ''}
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={adjAmount}
                      onChange={e => setAdjAmount(e.target.value)}
                      placeholder="Amount (0 to clear)"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={adjRemark}
                      onChange={e => setAdjRemark(e.target.value)}
                      placeholder="Remark (required if amount > 0)"
                      maxLength={200}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button size="sm" disabled={adjLoading} onClick={handleAdjust}>
                      {adjLoading ? 'Saving…' : 'Apply'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="border-t border-gray-100 pt-3 text-xs text-gray-400 space-y-0.5">
                {r.computedAt && <p>Computed: {format(parseISO(r.computedAt), 'dd MMM yyyy HH:mm')}</p>}
                {r.finalisedAt && <p>Finalised: {format(parseISO(r.finalisedAt), 'dd MMM yyyy HH:mm')}</p>}
              </div>
            </div>
          </>
        )}
      </div>

      {r && modal === 'finalize' && (
        <PayrollFinalizeModal
          open
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); mutate(); }}
          payrollId={r.id}
          yearMonth={r.yearMonth}
          employeeName={empName(r)}
        />
      )}
      {r && modal === 'unfinalize' && (
        <PayrollUnfinalizeModal
          open
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); mutate(); }}
          payrollId={r.id}
          yearMonth={r.yearMonth}
          employeeName={empName(r)}
        />
      )}
    </AdminLayout>
  );
}
