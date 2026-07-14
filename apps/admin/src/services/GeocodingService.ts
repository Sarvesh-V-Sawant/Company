export type GeocodingStatus = 'success' | 'failed' | 'disabled';

export interface GeocodingResult {
  address: string | null;
  geocodingStatus: GeocodingStatus;
  geocodingProvider: string | null;
}

const TIMEOUT_MS = 5_000;

function abortAfter(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function geocodeNominatim(latitude: number, longitude: number): Promise<GeocodingResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;
  const res = await fetch(url, {
    signal: abortAfter(TIMEOUT_MS),
    headers: { 'User-Agent': 'Genesis-HRMS/1.0', Accept: 'application/json' },
  });
  if (!res.ok) return { address: null, geocodingStatus: 'failed', geocodingProvider: 'nominatim' };

  const data = (await res.json()) as Record<string, unknown>;
  const addr = data['address'] as Record<string, string> | undefined;
  let address: string | null = null;

  if (addr) {
    const parts: string[] = [];
    const road = addr['road'] ?? addr['pedestrian'] ?? addr['path'];
    const area = addr['suburb'] ?? addr['neighbourhood'] ?? addr['village'] ?? addr['town'] ?? addr['city'];
    const state = addr['state_district'] ?? addr['state'];
    if (road) parts.push(road);
    if (area) parts.push(area);
    if (state) parts.push(state);
    address = parts.length > 0 ? parts.join(', ') : (data['display_name'] as string | null) ?? null;
  } else {
    address = (data['display_name'] as string | null) ?? null;
  }

  return { address, geocodingStatus: address ? 'success' : 'failed', geocodingProvider: 'nominatim' };
}

async function geocodeGoogle(latitude: number, longitude: number, apiKey: string): Promise<GeocodingResult> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
  const res = await fetch(url, { signal: abortAfter(TIMEOUT_MS) });
  if (!res.ok) return { address: null, geocodingStatus: 'failed', geocodingProvider: 'google' };

  const data = (await res.json()) as { status: string; results: Array<{ formatted_address: string }> };
  if (data.status !== 'OK' || !data.results.length) {
    return { address: null, geocodingStatus: 'failed', geocodingProvider: 'google' };
  }

  const address = data.results[0].formatted_address ?? null;
  return { address, geocodingStatus: address ? 'success' : 'failed', geocodingProvider: 'google' };
}

export const GeocodingService = {
  /** Reverse geocode coordinates. Never throws — returns failed result on any error. */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult> {
    const provider = process.env.GEOCODING_PROVIDER ?? 'nominatim';

    if (provider === 'disabled') {
      return { address: null, geocodingStatus: 'disabled', geocodingProvider: null };
    }

    try {
      if (provider === 'google') {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (apiKey) return await geocodeGoogle(latitude, longitude, apiKey);
        // No API key — fall through to Nominatim
      }
      return await geocodeNominatim(latitude, longitude);
    } catch {
      return { address: null, geocodingStatus: 'failed', geocodingProvider: provider };
    }
  },
};
