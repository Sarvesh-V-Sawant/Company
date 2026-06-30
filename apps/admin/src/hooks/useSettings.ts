'use client';
import useSWR, { mutate } from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { Settings } from '@/types/api';

interface SettingsResponse { success: boolean; data: Settings }

export function useSettings() {
  const { data, error, isLoading } = useSWR(
    '/api/v1/settings',
    (url: string) => apiFetch<SettingsResponse>(url),
  );
  return {
    settings: data?.data,
    isLoading,
    error,
    refresh: () => mutate('/api/v1/settings'),
  };
}
