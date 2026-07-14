'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';

interface Props {
  open:      boolean;
  mode:      'lock' | 'unlock';
  yearMonth: string;
  onClose:   () => void;
  onSuccess: () => void;
}

interface LockRes { success: boolean; error?: { code: string; message: string } }

export default function PayrollLockModal({ open, mode, yearMonth, onClose, onSuccess }: Props) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const isUnlock = mode === 'unlock';

  const handle = async () => {
    if (isUnlock && reason.trim().length < 10) {
      toast.error('Unlock reason must be at least 10 characters.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<LockRes>('/api/v1/payroll/lock', {
        method: isUnlock ? 'DELETE' : 'POST',
        body:   JSON.stringify(isUnlock ? { yearMonth, reason: reason.trim() } : { yearMonth }),
      });
      if (!result.success) {
        toast.error(result.error?.message ?? (isUnlock ? 'Failed to unlock payroll month.' : 'Failed to lock payroll month.'));
        return;
      }
      toast.success(isUnlock ? `Payroll ${yearMonth} unlocked.` : `Payroll ${yearMonth} locked.`);
      setReason('');
      onSuccess();
    } catch {
      toast.error(isUnlock ? 'Failed to unlock payroll month.' : 'Failed to lock payroll month.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">
          {isUnlock ? 'Unlock Payroll Month' : 'Lock Payroll Month'}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {isUnlock
            ? <>Unlock <strong>{yearMonth}</strong>? Compute, adjust, finalise and unfinalise will be re-enabled.</>
            : <>Lock <strong>{yearMonth}</strong>? Compute, adjust, finalise and unfinalise will be blocked until unlocked.</>}
        </p>
        {isUnlock && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason (required, min 10 chars)</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={500}
              placeholder="Reason for unlocking…"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={handle}
            loading={loading}
            className={isUnlock ? '' : 'bg-amber-600 hover:bg-amber-700'}
          >
            {isUnlock ? 'Unlock' : 'Lock Month'}
          </Button>
        </div>
      </div>
    </div>
  );
}
