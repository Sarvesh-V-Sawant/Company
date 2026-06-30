'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { TableSkeleton } from '@components/ui/skeleton';
import EmptyState from '@components/shared/EmptyState';
import useSWR from 'swr';
import { apiFetch } from '@lib/utils/api-client';

interface EmpRef { _id: string; firstName: string; lastName: string }
interface AttRec { _id: string; employeeId: EmpRef | string; date: string; status: string; workHours?: number }
interface Res { success: boolean; data: AttRec[] }

interface EmpSummary {
  name: string;
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  holiday: number;
  weekend: number;
  lwp: number;
  totalHours: number;
}

function getEmpId(r: AttRec): string {
  return typeof r.employeeId === 'object' ? r.employeeId._id : String(r.employeeId);
}
function getEmpName(r: AttRec): string {
  if (typeof r.employeeId === 'object') return `${r.employeeId.firstName} ${r.employeeId.lastName}`;
  return String(r.employeeId);
}

export default function AttendanceMonthlyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const monthParam = params.get('month');
  const currentMonth = monthParam ? new Date(monthParam + '-01') : new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const isCurrentMonth = format(currentMonth, 'yyyy-MM') >= format(new Date(), 'yyyy-MM');

  const { data, isLoading } = useSWR(
    `/api/v1/attendance?startDate=${format(monthStart, 'yyyy-MM-dd')}&endDate=${format(monthEnd, 'yyyy-MM-dd')}&limit=2000`,
    (url: string) => apiFetch<Res>(url),
  );

  const records = data?.data ?? [];
  const empMap = new Map<string, EmpSummary>();
  for (const r of records) {
    const id   = getEmpId(r);
    const name = getEmpName(r);
    if (!empMap.has(id)) empMap.set(id, { name, present: 0, absent: 0, leave: 0, halfDay: 0, holiday: 0, weekend: 0, lwp: 0, totalHours: 0 });
    const s = empMap.get(id)!;
    switch (r.status) {
      case 'present':  s.present++;  s.totalHours += r.workHours ?? 0; break;
      case 'absent':   s.absent++;   break;
      case 'leave':    s.leave++;    break;
      case 'half-day': s.halfDay++;  break;
      case 'holiday':  s.holiday++;  break;
      case 'weekend':  s.weekend++;  break;
      case 'lwp':      s.lwp++;      break;
    }
  }
  const employees = Array.from(empMap.entries());

  const navigate = (offset: number) => {
    const newMonth = addMonths(currentMonth, offset);
    const sp = new URLSearchParams(params.toString());
    sp.set('month', format(newMonth, 'yyyy-MM'));
    router.push(`/attendance/monthly?${sp.toString()}`);
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Attendance', href: '/attendance' }, { label: 'Monthly' }]}>
      <div className="space-y-4">
        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
            <Link href="/attendance" className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-white hover:text-gray-900 transition-colors">Daily</Link>
            <Link href="/attendance/weekly" className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-white hover:text-gray-900 transition-colors">Weekly</Link>
            <span className="px-3 py-1.5 rounded-md bg-white text-gray-900 font-medium shadow-sm">Monthly</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-gray-700 w-36 text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate(1)} disabled={isCurrentMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'Present', 'Absent', 'Leave', 'Half‑Day', 'LWP', 'Holiday', 'Weekend', 'Total Hrs'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton rows={8} cols={9} />
            ) : employees.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={9}><EmptyState title="No attendance data for this month" /></td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {employees.map(([empId, s]) => (
                  <tr key={empId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 font-medium text-green-700">{s.present}</td>
                    <td className="px-4 py-3 text-red-600">{s.absent}</td>
                    <td className="px-4 py-3 text-blue-600">{s.leave}</td>
                    <td className="px-4 py-3 text-amber-600">{s.halfDay}</td>
                    <td className="px-4 py-3 text-orange-600">{s.lwp}</td>
                    <td className="px-4 py-3 text-gray-500">{s.holiday}</td>
                    <td className="px-4 py-3 text-gray-400">{s.weekend}</td>
                    <td className="px-4 py-3 text-gray-600">{s.totalHours.toFixed(1)}h</td>
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
