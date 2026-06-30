'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';
import type { LeaveRequest } from '@/types/api';

const approveSchema = z.object({ remark: z.string().optional() });
const rejectSchema  = z.object({ remark: z.string().min(10, 'Remark required (min 10 chars)') });

interface Props { leave: LeaveRequest; onSuccess: () => void; action: 'approve' | 'reject' }

export default function LeaveApprovalForm({ leave, onSuccess, action }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const schema = action === 'reject' ? rejectSchema : approveSchema;
  const { register, handleSubmit, formState: { errors } } = useForm<{ remark?: string }>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: { remark?: string }) => {
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/leaves/${leave._id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ remark: data.remark }),
      });
      toast.success(`Leave ${action === 'approve' ? 'approved' : 'rejected'}`);
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? `Failed to ${action} leave`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {action === 'reject' ? 'Rejection Reason *' : 'Remark (optional)'}
        </label>
        <textarea
          rows={3}
          placeholder={action === 'reject' ? 'State reason for rejection (min 10 chars)' : 'Add a note...'}
          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 resize-y"
          {...register('remark')}
        />
        {errors.remark && <p className="mt-1 text-xs text-red-600">{errors.remark.message}</p>}
      </div>
      <div className="flex justify-end gap-3">
        <Button
          type="submit"
          variant={action === 'reject' ? 'destructive' : 'default'}
          loading={submitting}
        >
          {action === 'approve' ? 'Approve Leave' : 'Reject Leave'}
        </Button>
      </div>
    </form>
  );
}
