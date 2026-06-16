export interface GeoFenceConfig {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const c =
    2 *
    Math.atan2(
      Math.sqrt(sinDLat * sinDLat + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * sinDLon * sinDLon),
      Math.sqrt(1 - sinDLat * sinDLat - Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * sinDLon * sinDLon),
    );
  return R * c;
}

export function isWithinGeoFence(point: GeoPoint, fence: GeoFenceConfig): boolean {
  const distance = haversineMeters(point, { latitude: fence.latitude, longitude: fence.longitude });
  return distance <= fence.radiusMeters;
}
