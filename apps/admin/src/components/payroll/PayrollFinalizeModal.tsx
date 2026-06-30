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

export default function PayrollFinalizeModal({ open, onClose, onSuccess, payrollId, yearMonth, employeeName }: Props) {
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const handle = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/payroll/${payrollId}/${yearMonth}/finalize`, { method: 'PATCH' });
      toast.success(`Payroll finalised for ${employeeName}`);
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to finalise payroll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Finalise Payroll</h2>
        <p className="text-sm text-gray-600 mb-5">
          Finalise <strong>{yearMonth}</strong> payroll for <strong>{employeeName}</strong>?
          Once finalised, this payroll will be locked and a payslip can be generated.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handle} loading={loading}>Finalise</Button>
        </div>
      </div>
    </div>
  );
}
