'use client';
import useSWR from 'swr';
import { Users, Clock, CalendarDays, RefreshCcw, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminLayout from '@components/layout/AdminLayout';
import { Skeleton } from '@components/ui/skeleton';
import { apiFetch } from '@lib/utils/api-client';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface DashboardData {
  employees: { total: number; active: number; inactive: number };
  attendance: { present: number; absent: number; onLeave: number; total: number };
  leaves: { pending: number; approved: number };
  regularizations: { pending: number };
  payroll: { draft: number; finalised: number };
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color} shrink-0`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const { data: empData, isLoading: empLoading }   = useSWR('/api/v1/employees?limit=1', (u: string) => apiFetch<{ pagination: { total: number } }>(u));
  const { data: todayAtt, isLoading: attLoading }   = useSWR('/api/v1/attendance?date=' + today + '&limit=1', (u: string) => apiFetch<{ data: { status: string }[] }>(u));
  const { data: pendLeaves, isLoading: lvLoading }  = useSWR('/api/v1/leaves?status=pending&limit=1',          (u: string) => apiFetch<{ pagination: { total: number } }>(u));
  const { data: pendRegs,   isLoading: regLoading } = useSWR('/api/v1/regularizations?status=pending&limit=1', (u: string) => apiFetch<{ pagination: { total: number } }>(u));

  const loading = empLoading || attLoading || lvLoading || regLoading;

  return (
    <AdminLayout breadcrumb={[{ label: 'Dashboard' }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))
          ) : (
            <>
              <StatCard label="Total Employees" value={empData?.pagination?.total ?? 0} icon={Users} color="bg-blue-500" />
              <StatCard label="Pending Leaves" value={pendLeaves?.pagination?.total ?? 0} sub="Awaiting review" icon={CalendarDays} color="bg-amber-500" />
              <StatCard label="Pending Regularizations" value={pendRegs?.pagination?.total ?? 0} sub="Awaiting review" icon={RefreshCcw} color="bg-purple-500" />
              <StatCard label="Today's Date" value={0} sub={today} icon={Clock} color="bg-green-500" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-4">Attendance Overview (Today)</h2>
            {attLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="flex items-center gap-6">
                {[
                  { label: 'Present', count: todayAtt?.data?.filter((r: { status: string }) => r.status === 'present').length ?? 0, color: 'bg-green-500' },
                  { label: 'Absent',  count: todayAtt?.data?.filter((r: { status: string }) => r.status === 'absent').length  ?? 0, color: 'bg-red-500'   },
                  { label: 'Leave',   count: todayAtt?.data?.filter((r: { status: string }) => r.status === 'leave').length   ?? 0, color: 'bg-blue-500'  },
                ].map(({ label, count, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                    <span className="text-sm text-gray-600">{label}: <strong>{count}</strong></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Review Leaves',          href: '/leave?status=pending'          },
                { label: 'Review Regularizations', href: '/regularization?status=pending' },
                { label: 'Run Payroll',            href: '/payroll'                         },
                { label: 'View Reports',           href: '/reports'                         },
              ].map(({ label, href }) => (
                <a key={href} href={href} className="flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
