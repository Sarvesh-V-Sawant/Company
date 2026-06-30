'use client';
import useSWR from 'swr';
import { apiFetch } from '@lib/utils/api-client';
import type { AttendanceRecord } from '@/types/api';

interface ListResponse { success: boolean; data: AttendanceRecord[]; pagination: { total: number; totalPages: number } }
interface SingleResponse { success: boolean; data: AttendanceRecord }

export function useAttendance(query: string) {
  const { data, error, isLoading } = useSWR(
    `/api/v1/attendance?${query}`,
    (url: string) => apiFetch<ListResponse>(url),
  );
  return { records: data?.data ?? [], pagination: data?.pagination, isLoading, error };
}

export function useAttendanceRecord(employeeId: string) {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const startDate = `${y}-${m}-01`;
  const endDate   = `${y}-${m}-${d}`;

  const { data, error, isLoading } = useSWR(
    employeeId
      ? `/api/v1/attendance/${employeeId}?startDate=${startDate}&endDate=${endDate}`
      : null,
    (url: string) => apiFetch<SingleResponse>(url),
  );
  return { record: data?.data, isLoading, error };
}
