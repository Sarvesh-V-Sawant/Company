'use client';
import useSWR, { mutate } from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { RegularizationRequest } from '@/types/api';

interface ListResponse { success: boolean; data: RegularizationRequest[]; pagination: { total: number; totalPages: number } }
interface SingleResponse { success: boolean; data: RegularizationRequest }

const fetcher = (url: string) => apiFetch<ListResponse>(url);

export function useRegularizations(query: string) {
  const { data, error, isLoading } = useSWR(`/api/v1/regularizations?${query}`, fetcher);
  return {
    regularizations: data?.data ?? [],
    pagination: data?.pagination,
    isLoading,
    error,
    refresh: () => mutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/regularizations')),
  };
}

export function useRegularization(id: string) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/v1/regularizations/${id}` : null,
    (url: string) => apiFetch<SingleResponse>(url),
  );
  return { regularization: data?.data, isLoading, error };
}
