'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { apiFetch } from '@lib/utils/api-client';

const schema = z.object({ date: z.string().min(1, 'Required'), name: z.string().min(1, 'Required') });
type Form = z.infer<typeof schema>;

interface Holiday { date: string; name: string }
interface Props { holidays?: Holiday[]; onSuccess?: () => void }

export default function SettingsHolidayForm({ holidays = [], onSuccess }: Props) {
  const [list, setList]       = useState<Holiday[]>(holidays);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });

  const addHoliday = (data: Form) => {
    setList(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
    reset();
  };

  const remove = (idx: number) => setList(prev => prev.filter((_, i) => i !== idx));

  const save = async () => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ holidays: list }) });
      toast.success('Holidays updated');
      onSuccess?.();
    } catch { toast.error('Failed to save holidays'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <form onSubmit={handleSubmit(addHoliday)} noValidate className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <Input type="date" error={!!errors.date} {...register('date')} />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
          <Input error={!!errors.name} placeholder="e.g. Diwali" {...register('name')} />
        </div>
        <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
      </form>
      {list.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((h, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs">{h.date}</td>
                  <td className="px-4 py-2">{h.name}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button onClick={save} loading={submitting}>Save Holidays</Button>
    </div>
  );
}
