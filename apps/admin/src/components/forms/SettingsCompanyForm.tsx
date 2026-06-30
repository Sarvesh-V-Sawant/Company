'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

const schema = z.object({
  name:     z.string().min(1, 'Required'),
  address:  z.string().optional(),
  timezone: z.string().min(1, 'Required'),
  currency: z.string().min(1, 'Required'),
});
type Form = z.infer<typeof schema>;

const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore', 'Asia/Dubai'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsCompanyForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: settings?.company,
  });

  useEffect(() => { if (settings?.company) reset(settings.company); }, [settings, reset]);

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ company: data }) });
      toast.success('Company settings updated');
      onSuccess?.();
    } catch { toast.error('Failed to update settings'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
        <Input error={!!errors.name} {...register('name')} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <Input {...register('address')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone *</label>
          <Select {...register('timezone')} error={!!errors.timezone}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency *</label>
          <Select {...register('currency')} error={!!errors.currency}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
      </div>
      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
