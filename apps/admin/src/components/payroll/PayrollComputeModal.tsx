'use client';
import { useState } from 'react';
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';

type Stage = 'idle' | 'validating' | 'computing' | 'partial' | 'success' | 'error';

interface ComputeError { employeeId: string; name?: string; error: string }
interface ComputeResult { computed: number; failed: number; errors?: ComputeError[] }

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultYearMonth?: string;
}

export default function PayrollComputeModal({ open, onClose, onSuccess, defaultYearMonth }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [yearMonth, setYearMonth] = useState(defaultYearMonth ?? new Date().toISOString().slice(0, 7));
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const handleCompute = async () => {
    setStage('validating');
    await new Promise(r => setTimeout(r, 350));
    setStage('computing');
    try {
      const res = await apiFetch<{ success: boolean; data?: ComputeResult }>('/api/v1/payroll/compute', {
        method: 'POST',
        body: JSON.stringify({ yearMonth }),
      });
      const data: ComputeResult = res.data ?? { computed: 0, failed: 0 };
      setResult(data);
      if (data.failed > 0 && data.computed > 0) {
        setStage('partial');
      } else if (data.failed > 0) {
        setErrorMsg(`${data.failed} employees failed to compute`);
        setStage('error');
      } else {
        setStage('success');
        toast.success(`Payroll computed for ${data.computed} employees`);
      }
    } catch (err: unknown) {
      setErrorMsg((err as { message?: string }).message ?? 'Computation failed');
      setStage('error');
    }
  };

  const reset = () => { setStage('idle'); setResult(null); setErrorMsg(''); };

  const handleClose = () => { reset(); onClose(); };
  const handleDone  = () => { reset(); onClose(); onSuccess(); };

  const isProcessing = stage === 'validating' || stage === 'computing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={!isProcessing ? handleClose : undefined} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">

        {/* Idle */}
        {stage === 'idle' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Run Payroll</h2>
            <p className="text-sm text-gray-500 mb-4">Compute payroll for all active employees for the selected month.</p>
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Month</label>
              <input
                type="month"
                value={yearMonth}
                onChange={e => setYearMonth(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCompute}>Compute Payroll</Button>
            </div>
          </>
        )}

        {/* Validating */}
        {stage === 'validating' && (
          <div className="text-center py-8">
            <Loader2 className="h-10 w-10 text-blue-600 mx-auto mb-3 animate-spin" />
            <p className="text-sm font-medium text-gray-900">Validating payroll data…</p>
            <p className="text-xs text-gray-500 mt-1">Checking for incomplete records</p>
          </div>
        )}

        {/* Computing */}
        {stage === 'computing' && (
          <div className="text-center py-8">
            <Loader2 className="h-10 w-10 text-blue-600 mx-auto mb-3 animate-spin" />
            <p className="text-sm font-medium text-gray-900">Computing payroll for {yearMonth}…</p>
            <p className="text-xs text-gray-500 mt-1">This may take a few seconds</p>
          </div>
        )}

        {/* Success */}
        {stage === 'success' && (
          <div className="text-center py-6">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">Payroll Computed</h2>
            <p className="text-sm text-gray-500 mt-1">{result?.computed ?? 0} employee{result?.computed !== 1 ? 's' : ''} processed for {yearMonth}</p>
            <Button className="mt-5 w-full" onClick={handleDone}>Done</Button>
          </div>
        )}

        {/* Partial success */}
        {stage === 'partial' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">Partially Computed</h2>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              {result?.computed} employee{result?.computed !== 1 ? 's' : ''} computed successfully, {result?.failed} failed.
            </p>
            {result?.errors && result.errors.length > 0 && (
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 mb-4 max-h-36 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs text-amber-800 mb-0.5">
                    <span className="font-medium">{e.name ?? e.employeeId}:</span> {e.error}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleDone}>Close</Button>
              <Button onClick={handleCompute}>Retry Failed</Button>
            </div>
          </>
        )}

        {/* Error */}
        {stage === 'error' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">Computation Failed</h2>
            </div>
            <p className="text-sm text-gray-600 mb-5">{errorMsg || 'An error occurred during payroll computation.'}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCompute}>Retry</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
