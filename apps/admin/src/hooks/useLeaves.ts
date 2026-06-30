'use client';
import useSWR, { mutate } from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { LeaveRequest } from '@/types/api';

interface ListResponse { success: boolean; data: LeaveRequest[]; pagination: { total: number; totalPages: number } }
interface SingleResponse { success: boolean; data: LeaveRequest }
interface BalanceResponse { success: boolean; data: { leaveType: string; balance: number; used: number; allocated: number }[] }

const fetcher = (url: string) => apiFetch<ListResponse>(url);

export function useLeaves(query: string) {
  const { data, error, isLoading } = useSWR(`/api/v1/leaves?${query}`, fetcher);
  return {
    leaves: data?.data ?? [],
    pagination: data?.pagination,
    isLoading,
    error,
    refresh: () => mutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/leaves')),
  };
}

export function useLeave(id: string) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/v1/leaves/${id}` : null,
    (url: string) => apiFetch<SingleResponse>(url),
  );
  return { leave: data?.data, isLoading, error };
}

export function useLeaveBalance(employeeId?: string) {
  const url = employeeId ? `/api/v1/leaves/balance?employeeId=${employeeId}` : '/api/v1/leaves/balance';
  const { data, error, isLoading } = useSWR(url, (u: string) => apiFetch<BalanceResponse>(u));
  return { balances: data?.data ?? [], isLoading, error };
}
