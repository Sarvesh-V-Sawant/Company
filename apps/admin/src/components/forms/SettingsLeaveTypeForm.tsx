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

const schema = z.object({
  code:        z.string().min(1, 'Required').max(10),
  name:        z.string().min(1, 'Required'),
  defaultDays: z.coerce.number().min(0).max(365),
  isPaid:      z.boolean(),
  carryForward:z.boolean(),
});
type Form = z.infer<typeof schema>;

interface LeaveType { code: string; name: string; defaultDays: number; isPaid: boolean; carryForward: boolean }
interface Props { leaveTypes?: LeaveType[]; onSuccess?: () => void }

export default function SettingsLeaveTypeForm({ leaveTypes = [], onSuccess }: Props) {
  const [list, setList]       = useState<LeaveType[]>(leaveTypes);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { isPaid: true, carryForward: false, defaultDays: 12 },
  });

  const add = (data: Form) => {
    setList(prev => [...prev.filter(l => l.code !== data.code), data]);
    reset({ isPaid: true, carryForward: false, defaultDays: 12 });
  };
  const remove = (code: string) => setList(prev => prev.filter(l => l.code !== code));

  const save = async () => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ leaveTypes: list }) });
      toast.success('Leave types updated');
      onSuccess?.();
    } catch { toast.error('Failed to save leave types'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <form onSubmit={handleSubmit(add)} noValidate className="grid grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
          <Input error={!!errors.code} placeholder="CL" {...register('code')} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <Input error={!!errors.name} placeholder="Casual Leave" {...register('name')} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Days/Year</label>
          <Input type="number" min={0} error={!!errors.defaultDays} {...register('defaultDays')} />
        </div>
        <div className="flex gap-4 items-end pb-0.5">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="rounded border-gray-300" {...register('isPaid')} /> Paid</label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="rounded border-gray-300" {...register('carryForward')} /> Carry</label>
          <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
        </div>
      </form>
      {list.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Code','Name','Days','Paid','Carry Fwd',''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(lt => (
                <tr key={lt.code} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{lt.code}</td>
                  <td className="px-3 py-2">{lt.name}</td>
                  <td className="px-3 py-2">{lt.defaultDays}</td>
                  <td className="px-3 py-2">{lt.isPaid ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">{lt.carryForward ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(lt.code)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button onClick={save} loading={submitting}>Save Leave Types</Button>
    </div>
  );
}
