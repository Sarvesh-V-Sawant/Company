'use client';
import useSWR, { mutate } from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { Notification } from '@/types/api';

interface ListResponse { success: boolean; data: Notification[]; pagination: { total: number; totalPages: number } }

const fetcher = (url: string) => apiFetch<ListResponse>(url);

export function useNotifications(query: string) {
  const { data, error, isLoading } = useSWR(`/api/v1/notifications?${query}`, fetcher);
  return {
    notifications: data?.data ?? [],
    pagination: data?.pagination,
    isLoading,
    error,
    refresh: () => mutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/notifications')),
  };
}
