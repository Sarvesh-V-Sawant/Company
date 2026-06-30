'use client';
import { useRouter } from 'next/navigation';
import AdminLayout from '@components/layout/AdminLayout';
import EmployeeForm from '@components/forms/EmployeeForm';

export default function NewEmployeePage() {
  const router = useRouter();
  return (
    <AdminLayout breadcrumb={[{ label: 'Employees', href: '/employees' }, { label: 'New Employee' }]}>
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Add Employee</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <EmployeeForm onSuccess={() => router.push('/employees')} />
        </div>
      </div>
    </AdminLayout>
  );
}
