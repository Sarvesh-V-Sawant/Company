'use client';
import { useParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import AdminLayout from '@components/layout/AdminLayout';
import StatusBadge from '@components/shared/StatusBadge';
import { Skeleton } from '@components/ui/skeleton';
import { useAttendanceRecord } from '@/hooks/useAttendance';

export default function AttendanceEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const { record, isLoading, error } = useAttendanceRecord(id);

  if (isLoading) {
    return (
      <AdminLayout breadcrumb={[{ label: 'Attendance', href: '/attendance' }, { label: '…' }]}>
        <Skeleton className="h-64 w-full max-w-2xl" />
      </AdminLayout>
    );
  }
  if (error || !record) {
    return (
      <AdminLayout breadcrumb={[{ label: 'Attendance', href: '/attendance' }, { label: 'Not Found' }]}>
        <p className="text-sm text-gray-500">No attendance record found.</p>
      </AdminLayout>
    );
  }

  const records = Array.isArray(record) ? record : [record];

  return (
    <AdminLayout breadcrumb={[{ label: 'Attendance', href: '/attendance' }, { label: 'Employee Attendance' }]}>
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Employee Attendance</h1>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Status', 'Check-in', 'Check-out', 'Hours'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r: { _id: string; date: string; status: string; checkIn?: string; checkOut?: string; workHours?: number }) => (
                <tr key={r._id} className="border-b border-gray-100">
                  <td className="px-4 py-3">{format(parseISO(r.date), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs">{r.checkIn  ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.checkOut ?? '—'}</td>
                  <td className="px-4 py-3">{r.workHours != null ? `${r.workHours}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
