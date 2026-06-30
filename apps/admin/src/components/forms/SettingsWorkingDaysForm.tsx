'use client';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface Form { workingDays: string[] }
interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsWorkingDaysForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { control, handleSubmit, reset } = useForm<Form>({
    defaultValues: { workingDays: settings?.workingDays ?? ['monday','tuesday','wednesday','thursday','friday'] },
  });

  useEffect(() => { if (settings?.workingDays) reset({ workingDays: settings.workingDays }); }, [settings, reset]);

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ workingDays: data.workingDays }) });
      toast.success('Working days updated');
      onSuccess?.();
    } catch { toast.error('Failed to update settings'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <p className="text-sm text-gray-500">Select which days are working days.</p>
      <Controller
        control={control}
        name="workingDays"
        render={({ field }) => (
          <div className="grid grid-cols-2 gap-2">
            {ALL_DAYS.map(day => (
              <label key={day} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={field.value.includes(day)}
                  onChange={e => {
                    if (e.target.checked) field.onChange([...field.value, day]);
                    else field.onChange(field.value.filter((d: string) => d !== day));
                  }}
                />
                {day}
              </label>
            ))}
          </div>
        )}
      />
      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
