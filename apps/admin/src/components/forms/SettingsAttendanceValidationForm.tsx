'use client';
import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { X, Plus, Loader2, Wifi } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

const schema = z.object({
  mode: z.enum(['geofence', 'officeIp']),
  allowedOfficeIps: z.array(z.string()).max(20),
});
type Form = z.infer<typeof schema>;

interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsAttendanceValidationForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [detecting, setDetecting] = useState(false);

  const { register, handleSubmit, reset, control, setValue, watch } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: settings?.attendanceValidation?.mode ?? 'geofence',
      allowedOfficeIps: settings?.attendanceValidation?.allowedOfficeIps ?? [],
    },
  });

  useEffect(() => {
    if (settings?.attendanceValidation) {
      reset({
        mode: settings.attendanceValidation.mode,
        allowedOfficeIps: settings.attendanceValidation.allowedOfficeIps,
      });
    }
  }, [settings, reset]);

  const mode = useWatch({ control, name: 'mode' });
  const ips = watch('allowedOfficeIps');

  const addIp = () => {
    const trimmed = newIp.trim();
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4.test(trimmed)) { toast.error('Enter a valid IPv4 address'); return; }
    if (ips.includes(trimmed)) { toast.error('IP already in list'); return; }
    setValue('allowedOfficeIps', [...ips, trimmed]);
    setNewIp('');
  };

  const removeIp = (ip: string) => {
    setValue('allowedOfficeIps', ips.filter(x => x !== ip));
  };

  const detectCurrentIp = async () => {
    setDetecting(true);
    try {
      const res = await apiFetch<{ success: boolean; data: { currentIp: string; source: string } }>('/api/v1/settings/current-ip');
      const ip = res.data?.currentIp ?? '';
      if (!ip) { toast.error('Could not detect current network IP'); return; }
      if (ip.includes(':')) {
        toast.error('IPv6 detected — please enter your office public IPv4 address manually');
        return;
      }
      if (ips.includes(ip)) { toast.info('This IP is already in the allowlist'); return; }
      setValue('allowedOfficeIps', [...ips, ip]);
      toast.success(`Current network IP added: ${ip}`);
    } catch {
      toast.error('Could not detect current network IP');
    } finally {
      setDetecting(false);
    }
  };

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ attendanceValidation: data }),
      });
      toast.success('Attendance validation settings updated');
      onSuccess?.();
    } catch { toast.error('Failed to update settings'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 max-w-md">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Validation mode</p>
        <div className="space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="radio" value="geofence" {...register('mode')} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">GPS Geofence</p>
              <p className="text-xs text-gray-500">Employee must be within the configured radius at check-in.</p>
            </div>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="radio" value="officeIp" {...register('mode')} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Office Network / IP</p>
              <p className="text-xs text-gray-500">Employee must connect from an approved office IP address.</p>
            </div>
          </label>
        </div>
        <p className="mt-2 text-xs text-amber-600">Field/sales employees with &ldquo;Bypass attendance location check&rdquo; enabled bypass both modes.</p>
      </div>

      {mode === 'officeIp' && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Approved office IP addresses (IPv4)</p>
          <div className="space-y-1 mb-2">
            {ips.length === 0 && (
              <p className="text-xs text-red-600">No IPs configured — all check-ins will be blocked in this mode.</p>
            )}
            {ips.map(ip => (
              <div key={ip} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
                <span className="text-sm font-mono flex-1">{ip}</span>
                <button type="button" onClick={() => removeIp(ip)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIp(); } }}
              placeholder="e.g. 203.0.113.10"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addIp}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={detectCurrentIp}
            disabled={detecting}
            className="w-full mt-2"
          >
            {detecting
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Wifi className="h-4 w-4 mr-1.5" />
            }
            {detecting ? 'Detecting…' : 'Add Current Network IP'}
          </Button>
          <div className="mt-2 space-y-1 text-xs text-gray-400">
            <p>Connect this device to the office WiFi/network, then click <strong>Add Current Network IP</strong>.</p>
            <p>This detects the office public internet IP — not the private WiFi IP (192.168.x.x).</p>
            <p>Employees must be on this office network to check in when Office Network/IP mode is active.</p>
            <p>Field/Sales employees with location bypass enabled can check in from anywhere.</p>
          </div>
        </div>
      )}

      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
