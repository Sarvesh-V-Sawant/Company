'use client';
import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

const schema = z.object({
  enabled:      z.boolean(),
  lat:          z.coerce.number().min(-90).max(90),
  lng:          z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().min(50).max(5000),
});
type Form = z.infer<typeof schema>;

const GEO_ERRORS: Record<number, string> = {
  1: 'Location permission denied. Allow location access in your browser and try again.',
  2: 'Location unavailable. Check your network or device GPS.',
  3: 'Location request timed out. Try again.',
};

interface Props { settings?: Settings; onSuccess?: () => void }

export default function SettingsGeofenceForm({ settings, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: settings?.geofence ?? { enabled: false, lat: 0, lng: 0, radiusMeters: 200 },
  });

  useEffect(() => { if (settings?.geofence) reset(settings.geofence); }, [settings, reset]);

  const enabled = useWatch({ control, name: 'enabled' });

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Your browser does not support geolocation');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('lat', pos.coords.latitude, { shouldValidate: true });
        setValue('lng', pos.coords.longitude, { shouldValidate: true });
        setLocating(false);
        toast.success(`Location detected (±${Math.round(pos.coords.accuracy)} m accuracy)`);
      },
      (err) => {
        setLocating(false);
        toast.error(GEO_ERRORS[err.code] ?? 'Could not retrieve location');
      },
      { timeout: 10000, maximumAge: 0 },
    );
  };

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ geofence: data }) });
      toast.success('Geofence settings updated');
      onSuccess?.();
    } catch { toast.error('Failed to update settings'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 max-w-md">
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input type="checkbox" className="rounded border-gray-300" {...register('enabled')} />
        Enable geofencing for check-in/out
      </label>
      {enabled && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Office Location</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={locating}
              onClick={handleUseCurrentLocation}
            >
              {locating ? 'Detecting…' : 'Use Current Location'}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <Input type="number" step="any" error={!!errors.lat} {...register('lat')} />
              {errors.lat && <p className="mt-1 text-xs text-red-600">{errors.lat.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <Input type="number" step="any" error={!!errors.lng} {...register('lng')} />
              {errors.lng && <p className="mt-1 text-xs text-red-600">{errors.lng.message}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Radius (meters)</label>
            <Input type="number" min={50} max={5000} error={!!errors.radiusMeters} {...register('radiusMeters')} />
            {errors.radiusMeters && <p className="mt-1 text-xs text-red-600">{errors.radiusMeters.message}</p>}
          </div>
        </>
      )}
      <Button type="submit" loading={submitting}>Save Changes</Button>
    </form>
  );
}
