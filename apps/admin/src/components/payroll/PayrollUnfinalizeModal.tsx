'use client';
import { useState } from 'react';
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

export default function PayrollUnfinalizeModal({ open, onClose, onSuccess, payrollId, yearMonth, employeeName }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const handle = async () => {
    if (reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/api/v1/payroll/${payrollId}/${yearMonth}/unfinalize`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      });
      toast.success(`Payroll unfinalised for ${employeeName}`);
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to unfinalize payroll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">⚠ Unfinalize Payroll</h2>
        <p className="text-sm text-gray-600 mb-1">
          Unfinalize <strong>{yearMonth}</strong> payroll for <strong>{employeeName}</strong>?
        </p>
        <p className="text-xs text-gray-400 mb-4">
          This will set status back to Draft and require re-finalization.
        </p>
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Reason <span className="text-gray-400 font-normal">(min 10 characters)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Reason for unfinalization…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handle} loading={loading}>Unfinalize</Button>
        </div>
      </div>
    </div>
  );
}
