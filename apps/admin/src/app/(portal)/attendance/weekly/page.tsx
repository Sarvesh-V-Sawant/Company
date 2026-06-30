'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import StatusBadge from '@components/shared/StatusBadge';
import { TableSkeleton } from '@components/ui/skeleton';
import useSWR from 'swr';
import { apiFetch } from '@lib/utils/api-client';

interface EmpRef { _id: string; firstName: string; lastName: string }
interface AttRec { _id: string; employeeId: EmpRef | string; date: string; status: string }
interface Res { success: boolean; data: AttRec[] }

function getEmpId(r: AttRec): string {
  return typeof r.employeeId === 'object' ? r.employeeId._id : String(r.employeeId);
}
function getEmpName(r: AttRec): string {
  if (typeof r.employeeId === 'object') return `${r.employeeId.firstName} ${r.employeeId.lastName}`;
  return String(r.employeeId);
}

export default function AttendanceWeeklyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const weekOffset = Number(params.get('week') ?? 0);

  const baseDate = new Date();
  const weekStart = startOfWeek(addWeeks(baseDate, weekOffset), { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr   = format(weekEnd,   'yyyy-MM-dd');

  const { data, isLoading } = useSWR(
    `/api/v1/attendance?startDate=${startStr}&endDate=${endStr}&limit=500`,
    (url: string) => apiFetch<Res>(url),
  );

  const records = data?.data ?? [];

  const empMap = new Map<string, { name: string; byDate: Map<string, string> }>();
  for (const r of records) {
    const id   = getEmpId(r);
    const name = getEmpName(r);
    if (!empMap.has(id)) empMap.set(id, { name, byDate: new Map() });
    empMap.get(id)!.byDate.set(r.date.slice(0, 10), r.status);
  }
  const employees = Array.from(empMap.entries());

  const setWeek = (offset: number) => {
    const sp = new URLSearchParams(params.toString());
    sp.set('week', String(offset));
    router.push(`/attendance/weekly?${sp.toString()}`);
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Attendance', href: '/attendance' }, { label: 'Weekly' }]}>
      <div className="space-y-4">
        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
            <Link href="/attendance" className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-white hover:text-gray-900 transition-colors">Daily</Link>
            <span className="px-3 py-1.5 rounded-md bg-white text-gray-900 font-medium shadow-sm">Weekly</span>
            <Link href="/attendance/monthly" className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-white hover:text-gray-900 transition-colors">Monthly</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeek(weekOffset - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-gray-700 w-48 text-center">
              {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
            </span>
            <Button variant="outline" size="sm" onClick={() => setWeek(weekOffset + 1)} disabled={weekOffset >= 0}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeek(0)}>Today</Button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-44">Employee</th>
                {days.map(d => (
                  <th key={d.toISOString()} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[90px]">
                    <div>{format(d, 'EEE')}</div>
                    <div className="text-gray-400 font-normal normal-case">{format(d, 'd MMM')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : employees.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                    No attendance data for this week
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {employees.map(([empId, { name, byDate }]) => (
                  <tr key={empId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900 truncate max-w-[176px]">{name}</td>
                    {days.map(d => {
                      const dateKey = format(d, 'yyyy-MM-dd');
                      const status  = byDate.get(dateKey);
                      return (
                        <td key={dateKey} className="px-3 py-2 text-center">
                          {status
                            ? <StatusBadge status={status} />
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
