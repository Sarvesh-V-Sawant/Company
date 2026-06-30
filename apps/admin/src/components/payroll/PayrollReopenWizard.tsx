'use client';
import { useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payrollId: string;
  yearMonth: string;
  employeeName: string;
}

type Step = 1 | 2 | 3 | 'done';

export default function PayrollReopenWizard({ open, onClose, onSuccess, payrollId, yearMonth, employeeName }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [reason, setReason] = useState('Leave revoked post-finalization');
  const [loading, setLoading] = useState(false);
  const [recomputedAmount, setRecomputedAmount] = useState<number | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  if (!open) return null;

  const reset = () => {
    setStep(1);
    setReason('Leave revoked post-finalization');
    setLoading(false);
    setRecomputedAmount(null);
    setShowCancelConfirm(false);
  };

  const handleClose = () => { reset(); onClose(); };
  const handleDone  = () => { reset(); onClose(); onSuccess(); };

  const handleCloseAttempt = () => {
    if (step !== 1 && step !== 'done') { setShowCancelConfirm(true); return; }
    handleClose();
  };

  const handleUnfinalize = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/payroll/${payrollId}/${yearMonth}/unfinalize`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      });
      setStep(2);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Unfinalize failed');
    } finally { setLoading(false); }
  };

  const handleRecompute = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data?: { netSalary?: number } }>(
        '/api/v1/payroll/compute',
        { method: 'POST', body: JSON.stringify({ yearMonth }) },
      );
      setRecomputedAmount(res.data?.netSalary ?? null);
      setStep(3);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Recompute failed');
    } finally { setLoading(false); }
  };

  const handleFinalize = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/payroll/${payrollId}/${yearMonth}/finalize`, { method: 'PATCH' });
      setStep('done');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Finalize failed');
    } finally { setLoading(false); }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleCloseAttempt} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">

        {/* Cancel mid-flow confirmation */}
        {showCancelConfirm && (
          <div className="absolute inset-0 bg-white rounded-xl z-10 p-6 flex flex-col justify-center">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Cancel Workflow?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Payroll for <strong>{employeeName}</strong> remains unfinalised until the workflow is completed.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowCancelConfirm(false)}>Keep Going</Button>
              <Button variant="outline" onClick={handleClose}>Cancel Anyway</Button>
            </div>
          </div>
        )}

        {/* Step indicator */}
        {step !== 'done' && (
          <div className="flex items-center gap-1 mb-5">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  (step as number) > n
                    ? 'bg-green-500 text-white'
                    : step === n
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}>
                  {(step as number) > n ? '✓' : n}
                </div>
                {n < 3 && <div className="h-px w-6 bg-gray-200 mx-1" />}
              </div>
            ))}
            <span className="ml-2 text-xs text-gray-500">Step {step} of 3</span>
          </div>
        )}

        {/* Step 1 — Unfinalize */}
        {step === 1 && (
          <>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Step 1 of 3 — Unfinalize Payroll</h2>
            <p className="text-sm text-gray-600 mb-4">
              Unfinalize <strong>{yearMonth}</strong> payroll for <strong>{employeeName}</strong>?
              Required to update payroll after leave revocation.
            </p>
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reason (pre-filled, editable)</label>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCloseAttempt} disabled={loading}>Cancel</Button>
              <Button onClick={handleUnfinalize} loading={loading}>Unfinalize — Step 1</Button>
            </div>
          </>
        )}

        {/* Step 2 — Recompute */}
        {step === 2 && (
          <>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Step 2 of 3 — Recompute Payroll</h2>
            <p className="text-sm text-gray-600 mb-1">
              {employeeName}&apos;s {yearMonth} status: <span className="font-medium text-green-700">Draft ✓</span>
            </p>
            <p className="text-sm text-gray-600 mb-5">Recompute payroll with updated leave data?</p>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Computing…
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCloseAttempt} disabled={loading}>Cancel</Button>
              <Button onClick={handleRecompute} loading={loading}>Recompute — Step 2</Button>
            </div>
          </>
        )}

        {/* Step 3 — Review & Finalize */}
        {step === 3 && (
          <>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Step 3 of 3 — Review &amp; Finalize</h2>
            <p className="text-sm text-gray-600 mb-4">
              {yearMonth} payroll for <strong>{employeeName}</strong> recomputed.
            </p>
            {recomputedAmount !== null && (
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 mb-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Updated Net Salary</span>
                  <span className="font-semibold text-gray-900">{fmt(recomputedAmount)}</span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCloseAttempt} disabled={loading}>Cancel</Button>
              <Button onClick={handleFinalize} loading={loading}>Finalize Now</Button>
            </div>
          </>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="text-center py-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">Payroll Updated &amp; Finalised</h2>
            <p className="text-sm text-gray-500 mt-1">
              {yearMonth} for <strong>{employeeName}</strong> corrected and finalised.
            </p>
            <Button className="mt-5 w-full" onClick={handleDone}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}
