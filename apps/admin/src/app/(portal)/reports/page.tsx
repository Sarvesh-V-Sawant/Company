'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Download, BarChart3 } from 'lucide-react';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { apiFetch, apiFetchBlob } from '@lib/utils/api-client';

type ReportResult = Record<string, unknown>[];

interface ReportCard {
  id: string;
  title: string;
  description: string;
  exportPath: string;
  filters: React.ReactNode;
  buildQuery: () => string;
  columns: string[];
  rowMapper: (row: Record<string, unknown>, i: number) => React.ReactNode;
}

function useReportCard(fetchPath: string) {
  const [data, setData]       = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (query: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: ReportResult }>(`${fetchPath}?${query}`);
      setData(res.data ?? []);
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const exportXlsx = async (query: string, filename: string) => {
    try {
      const blob = await apiFetchBlob(`${fetchPath}/export?${query}`);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  return { data, loading, run, exportXlsx };
}

function ReportSection({ title, description, buildQuery, exportPath, filters, columns, rowMapper }: Omit<ReportCard, 'id'>) {
  const { data, loading, run, exportXlsx } = useReportCard(exportPath);
  const [q, setQ] = useState('');

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => exportXlsx(q, `${title.toLowerCase().replace(/ /g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
            <Button size="sm" loading={loading} onClick={() => { const built = buildQuery(); setQ(built); run(built); }}>
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Generate
            </Button>
          </div>
        </div>
        <div className="flex gap-3 mt-3 flex-wrap">{filters}</div>
      </div>
      {data && (
        data.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {columns.map(c => <th key={c} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => <tr key={i} className="border-b border-gray-100">{rowMapper(row, i)}</tr>)}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [attFrom, setAttFrom]   = useState('');
  const [attTo,   setAttTo]     = useState('');
  const [lvFrom,  setLvFrom]    = useState('');
  const [lvTo,    setLvTo]      = useState('');
  const [lvStatus,setLvStatus]  = useState('');
  const [payMonth,setPayMonth]  = useState('');

  const td = (v: unknown) => <td className="px-4 py-2 text-gray-700">{String(v ?? '—')}</td>;

  return (
    <AdminLayout breadcrumb={[{ label: 'Reports' }]}>
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>

        <ReportSection
          title="Attendance Report"
          description="Daily attendance summary by employee"
          exportPath="/api/v1/reports/attendance"
          buildQuery={() => new URLSearchParams({ ...(attFrom && { startDate: attFrom }), ...(attTo && { endDate: attTo }) }).toString()}
          filters={<>
            <Input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} className="w-36" />
            <Input type="date" value={attTo}   onChange={e => setAttTo(e.target.value)}   className="w-36" />
          </>}
          columns={['Employee', 'Department', 'Present', 'Absent', 'Leave', 'LWP', 'Total']}
          rowMapper={r => <>{td(r.employeeName)}{td(r.department)}{td(r.present)}{td(r.absent)}{td(r.leave)}{td(r.lwp)}{td(r.total)}</>}
        />

        <ReportSection
          title="Leave Report"
          description="Leave requests with status breakdown"
          exportPath="/api/v1/reports/leave"
          buildQuery={() => new URLSearchParams({ ...(lvFrom && { startDate: lvFrom }), ...(lvTo && { endDate: lvTo }), ...(lvStatus && { status: lvStatus }) }).toString()}
          filters={<>
            <Input type="date" value={lvFrom} onChange={e => setLvFrom(e.target.value)} className="w-36" />
            <Input type="date" value={lvTo}   onChange={e => setLvTo(e.target.value)}   className="w-36" />
            <Select value={lvStatus} onChange={e => setLvStatus(e.target.value)} className="w-36">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
          </>}
          columns={['Employee', 'Leave Type', 'Start', 'End', 'Days', 'Status']}
          rowMapper={r => <>{td(r.employeeName)}{td(r.leaveType)}{td(r.startDate)}{td(r.endDate)}{td(r.days)}{td(r.status)}</>}
        />

        <ReportSection
          title="Payroll Report"
          description="Monthly payroll summary"
          exportPath="/api/v1/reports/payroll"
          buildQuery={() => new URLSearchParams({ ...(payMonth && { yearMonth: payMonth }) }).toString()}
          filters={<Input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)} className="w-44" />}
          columns={['Employee', 'Month', 'Present', 'LOP', 'Gross', 'Deductions', 'Net', 'Status']}
          rowMapper={r => <>{td(r.employeeName)}{td(r.yearMonth)}{td(r.presentDays)}{td(r.lopDays)}{td(r.grossSalary)}{td(r.deductions)}{td(r.netSalary)}{td(r.status)}</>}
        />

        <ReportSection
          title="Regularization Report"
          description="Attendance regularization requests by status and type"
          exportPath="/api/v1/reports/regularization"
          buildQuery={() => new URLSearchParams({
            ...(attFrom && { startDate: attFrom }),
            ...(attTo && { endDate: attTo }),
          }).toString()}
          filters={<>
            <Input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} className="w-36" />
            <Input type="date" value={attTo}   onChange={e => setAttTo(e.target.value)}   className="w-36" />
          </>}
          columns={['Date', 'Employee', 'Type', 'Status', 'Reason', 'Review Remark']}
          rowMapper={r => <>{td(r.date)}{td(r.employeeName)}{td(r.type)}{td(r.status)}{td(r.reason)}{td(r.reviewRemark)}</>}
        />

        <ReportSection
          title="Employee Summary"
          description="Headcount by department and status"
          exportPath="/api/v1/reports/employee-summary"
          buildQuery={() => ''}
          filters={null}
          columns={['Department', 'Active', 'Inactive', 'Total']}
          rowMapper={r => <>{td(r.department)}{td(r.active)}{td(r.inactive)}{td(r.total)}</>}
        />

        <ReportSection
          title="Department Summary"
          description="Attendance and leave metrics by department"
          exportPath="/api/v1/reports/department-summary"
          buildQuery={() => new URLSearchParams({ ...(attFrom && { startDate: attFrom }), ...(attTo && { endDate: attTo }) }).toString()}
          filters={<>
            <Input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} className="w-36" placeholder="From" />
            <Input type="date" value={attTo}   onChange={e => setAttTo(e.target.value)}   className="w-36" placeholder="To" />
          </>}
          columns={['Department', 'Employees', 'Avg Present', 'Avg Absent', 'Total Leave Days']}
          rowMapper={r => <>{td(r.department)}{td(r.totalEmployees)}{td(r.avgPresentDays)}{td(r.avgAbsentDays)}{td(r.totalLeaveDays)}</>}
        />
      </div>
    </AdminLayout>
  );
}
