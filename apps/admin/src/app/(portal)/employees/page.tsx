'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import StatusBadge from '@components/shared/StatusBadge';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { TableSkeleton } from '@components/ui/skeleton';
import { useEmployees } from '@/hooks/useEmployees';
import { usePagination } from '@/hooks/usePagination';
import { apiFetchBlob } from '@lib/utils/api-client';

let _debounce: ReturnType<typeof setTimeout> | null = null;

export default function EmployeesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);

  const search   = params.get('search') ?? '';
  const isActive = params.get('isActive') ?? '';

  const query = buildQuery({ search: search || undefined, isActive: isActive || undefined });
  const { employees, pagination, isLoading } = useEmployees(query);

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/employees?${sp.toString()}`);
  };

  const handleExport = async () => {
    try {
      const blob = await apiFetchBlob(`/api/v1/employees/export?${buildQuery({ search: search || undefined, isActive: isActive || undefined })}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `employees-${format(new Date(), 'yyyy-MM-dd')}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Employees' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
            <Button size="sm" onClick={() => router.push('/employees/new')}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Employee
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-8" placeholder="Search name, email, ID…" defaultValue={search}
              onChange={e => {
                if (_debounce) clearTimeout(_debounce);
                _debounce = setTimeout(() => updateParam('search', e.target.value), 400);
              }} />
          </div>
          <Select value={isActive} onChange={e => updateParam('isActive', e.target.value)} className="w-36">
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee ID', 'Name', 'Email', 'Department', 'Designation', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? <TableSkeleton rows={8} cols={7} /> : employees.length === 0 ? (
              <tbody><tr><td colSpan={7}>
                <EmptyState title="No employees found" filtered={!!(search || isActive)} onClearFilters={() => router.push('/employees')} />
              </td></tr></tbody>
            ) : (
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/employees/${emp.id}`)}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{emp.employeeId}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.firstName} {emp.lastName}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.email}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.department ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.designation ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={emp.isActive ? 'active' : 'inactive'} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); router.push(`/employees/${emp.id}`); }}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {pagination && pagination.totalPages > 1 && (
            <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} limit={limit} onPageChange={setPage} />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
