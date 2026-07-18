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
  halfDayAggregationCount: z.coerce.number().int().min(0).max(31),
});
type Form = z.infer<typeof schema>;

interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsPayrollRulesForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { halfDayAggregationCount: settings?.payrollRules?.halfDayAggregationCount ?? 0 },
  });

  useEffect(() => {
    if (settings?.payrollRules !== undefined) {
      reset({ halfDayAggregationCount: settings.payrollRules.halfDayAggregationCount });
    }
  }, [settings, reset]);

  const count = watch('halfDayAggregationCount');

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ payrollRules: data }),
      });
      toast.success('Payroll rules updated');
      onSuccess?.();
    } catch { toast.error('Failed to update payroll rules'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Half-day aggregation (days per deduction)
        </label>
        <Input
          type="number"
          min={0}
          max={31}
          step={1}
          error={!!errors.halfDayAggregationCount}
          {...register('halfDayAggregationCount')}
        />
        {errors.halfDayAggregationCount && (
          <p className="mt-1 text-xs text-red-600">{errors.halfDayAggregationCount.message}</p>
        )}
        <p className="mt-1.5 text-xs text-gray-500">
          {Number(count) === 0
            ? 'Disabled — half-day attendance marks have no direct payroll deduction.'
            : `Every ${count} half-day attendance marks = 1 deduction day. Remaining marks count as 0.5 days each.`
          }
        </p>
        <p className="mt-1 text-xs text-amber-600">
          Re-compute all draft payroll records after changing this setting.
        </p>
      </div>
      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
