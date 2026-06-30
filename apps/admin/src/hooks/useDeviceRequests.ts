'use client';
import useSWR from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { DeviceRequestItem } from '@app-types/api';

interface DeviceRequestsResponse {
  success: boolean;
  data: DeviceRequestItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface CountResponse {
  success: boolean;
  data: { count: number };
}

export function useDeviceRequests(params: {
  status?: 'pending' | 'approved' | 'rejected';
  page?: number;
  limit?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);

  const { data, error, isLoading, mutate } = useSWR<DeviceRequestsResponse>(
    `/api/v1/devices/requests?${qs}`,
    (url: string) => apiFetch<DeviceRequestsResponse>(url),
    { refreshInterval: 30_000 },
  );

  return {
    requests:   data?.data ?? [],
    pagination: data?.pagination,
    isLoading,
    error,
    refresh:    mutate,
  };
}

export function usePendingDeviceRequestCount() {
  const { data } = useSWR<CountResponse>(
    '/api/v1/devices/requests/count',
    (url: string) => apiFetch<CountResponse>(url),
    { refreshInterval: 30_000 },
  );
  return data?.data?.count ?? 0;
}
