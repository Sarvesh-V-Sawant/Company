'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

const schema = z.object({
  startTime:           z.string().min(1, 'Required'),
  endTime:             z.string().min(1, 'Required'),
  gracePeriodMinutes:  z.coerce.number().min(0).max(120),
});
type Form = z.infer<typeof schema>;

interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsShiftForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: settings?.shift ?? { startTime: '09:00', endTime: '18:00', gracePeriodMinutes: 15 },
  });

  useEffect(() => { if (settings?.shift) reset(settings.shift); }, [settings, reset]);

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ shift: data }) });
      toast.success('Shift settings updated');
      onSuccess?.();
    } catch { toast.error('Failed to update settings'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 max-w-md">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
          <Input type="time" error={!!errors.startTime} {...register('startTime')} />
          {errors.startTime && <p className="mt-1 text-xs text-red-600">{errors.startTime.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
          <Input type="time" error={!!errors.endTime} {...register('endTime')} />
          {errors.endTime && <p className="mt-1 text-xs text-red-600">{errors.endTime.message}</p>}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (minutes)</label>
        <Input type="number" min={0} max={120} error={!!errors.gracePeriodMinutes} {...register('gracePeriodMinutes')} />
        {errors.gracePeriodMinutes && <p className="mt-1 text-xs text-red-600">{errors.gracePeriodMinutes.message}</p>}
      </div>
      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
