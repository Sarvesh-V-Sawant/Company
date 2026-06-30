'use client';
import useSWR, { mutate } from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { PayrollRecord } from '@/types/api';

interface ListResponse { success: boolean; data: PayrollRecord[]; pagination: { total: number; totalPages: number } }

const fetcher = (url: string) => apiFetch<ListResponse>(url);

export function usePayroll(query: string) {
  const { data, error, isLoading } = useSWR(`/api/v1/payroll?${query}`, fetcher);
  return {
    payroll: data?.data ?? [],
    pagination: data?.pagination,
    isLoading,
    error,
    refresh: () => mutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/payroll')),
  };
}
