'use client';
import useSWR from 'swr';
import { apiFetch } from '@lib/utils/api-client';

interface Meta { total: number }
interface R { success: boolean; meta?: Meta; pagination?: Meta }
interface CountR { success: boolean; data?: { count: number } }

const fetcher = (url: string) => apiFetch<R>(url);
const countFetcher = (url: string) => apiFetch<CountR>(url);

export function useSidebarCounts() {
  const { data: leaves }   = useSWR('/api/v1/leaves?status=pending&limit=1',          fetcher,      { refreshInterval: 300_000 });
  const { data: regs }     = useSWR('/api/v1/regularizations?status=pending&limit=1', fetcher,      { refreshInterval: 300_000 });
  const { data: notifs }   = useSWR('/api/v1/notifications?isRead=false&limit=1',     fetcher,      { refreshInterval: 300_000 });
  const { data: devices }  = useSWR('/api/v1/devices/requests/count',                 countFetcher, { refreshInterval: 30_000 });

  return {
    leaves:          leaves?.meta?.total  ?? leaves?.pagination?.total  ?? 0,
    regularizations: regs?.meta?.total    ?? regs?.pagination?.total    ?? 0,
    notifications:   notifs?.meta?.total  ?? notifs?.pagination?.total  ?? 0,
    employees:       0,
    pendingDevices:  devices?.data?.count ?? 0,
  };
}
