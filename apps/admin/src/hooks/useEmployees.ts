'use client';
import useSWR, { mutate } from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { Employee } from '@/types/api';

interface ListResponse { success: boolean; data: Employee[]; pagination: { total: number; totalPages: number } }
interface SingleResponse { success: boolean; data: Employee }

const fetcher = (url: string) => apiFetch<ListResponse>(url);

export function useEmployees(query: string) {
  const { data, error, isLoading } = useSWR(`/api/v1/employees?${query}`, fetcher);
  return {
    employees: data?.data ?? [],
    pagination: data?.pagination,
    isLoading,
    error,
    refresh: () => mutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/employees')),
  };
}

export function useEmployee(id: string) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/v1/employees/${id}` : null,
    (url: string) => apiFetch<SingleResponse>(url),
  );
  return { employee: data?.data, isLoading, error };
}
