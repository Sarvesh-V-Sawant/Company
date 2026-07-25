'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { apiFetch } from '@lib/utils/api-client';
import type { Employee } from '@/types/api';

// ── Constants ─────────────────────────────────────────────────────────────

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().split('T')[0];

// ── Schemas ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  employeeId:           z.string().min(1, 'Required').max(20, 'Max 20 characters'),
  firstName:            z.string().min(1, 'Required').max(50),
  lastName:             z.string().min(1, 'Required').max(50),
  email:                z.string().email('Invalid email').max(255),
  role:                 z.enum(['admin', 'employee', 'super_admin', 'manager', 'executive']),
  phone:                z.string().optional(),
  department:           z.string().max(100).optional(),
  designation:          z.string().max(100).optional(),
  monthlySalary:        z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .min(0, 'Must be ≥ 0'),
  dateOfJoining:        z.string()
    .regex(DATE_REGEX, 'Required')
    .refine(d => d <= today(), { message: 'Cannot be a future date' }),
  allowOutsideGeofence: z.boolean().optional(),
});

const salaryComponentsSchema = z.object({
  basic:            z.coerce.number().min(0).optional(),
  hra:              z.coerce.number().min(0).optional(),
  specialAllowance: z.coerce.number().min(0).optional(),
  otherAllowances:  z.coerce.number().min(0).optional(),
});

const editSchema = z.object({
  firstName:             z.string().min(1, 'Required').max(50).optional(),
  lastName:              z.string().min(1, 'Required').max(50).optional(),
  phone:                 z.string().optional(),
  department:            z.string().max(100).optional(),
  designation:           z.string().max(100).optional(),
  monthlySalary:         z.coerce.number({ invalid_type_error: 'Must be a number' }).min(0).optional(),
  salaryComponents:      salaryComponentsSchema.optional(),
  allowOutsideGeofence:  z.boolean().optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizePhone(raw: string | undefined): string | null | undefined {
  if (raw === undefined || raw.trim() === '') return null;
  const cleaned = raw.trim().replace(/[\s\-().]/g, '');
  if (E164_REGEX.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return `+91${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function generateEmployeeId(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `EMP${n}`;
}

// ── Create Form ───────────────────────────────────────────────────────────

function CreateEmployeeForm({ onSuccess }: { onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      employeeId:           generateEmployeeId(),
      role:                 'employee',
      allowOutsideGeofence: false,
    },
  });
  const allowOutsideGeofence = watch('allowOutsideGeofence');

  const onSubmit = async (data: CreateForm) => {
    setSubmitting(true);
    try {
      const phone = normalizePhone(data.phone);
      if (data.phone?.trim() && !E164_REGEX.test(phone ?? '')) {
        toast.error('Phone number could not be parsed. Use format: 9876543210 or +919876543210');
        return;
      }
      await apiFetch('/api/v1/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeId:           data.employeeId.trim().toUpperCase(),
          firstName:            data.firstName.trim(),
          lastName:             data.lastName.trim(),
          email:                data.email.trim().toLowerCase(),
          role:                 data.role,
          phone:                phone ?? undefined,
          department:           data.department?.trim() || undefined,
          designation:          data.designation?.trim() || undefined,
          monthlySalary:        data.monthlySalary,
          dateOfJoining:        data.dateOfJoining,
          allowOutsideGeofence: data.allowOutsideGeofence ?? false,
        }),
      });
      toast.success('Employee created. A welcome email with password setup instructions has been sent.');
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to create employee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Employee ID <span className="text-red-500">*</span>
        </label>
        <Input {...register('employeeId')} error={!!errors.employeeId}
          placeholder="EMP0001" className="font-mono uppercase" />
        {errors.employeeId
          ? <p className="mt-1 text-xs text-red-600">{errors.employeeId.message}</p>
          : <p className="mt-1 text-xs text-gray-500">Auto-generated. Edit to use your own numbering (e.g. HR-001).</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <Input {...register('firstName')} error={!!errors.firstName} />
          {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <Input {...register('lastName')} error={!!errors.lastName} />
          {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <Input type="email" {...register('email')} error={!!errors.email}
          placeholder="employee@company.com" />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <Input type="tel" {...register('phone')} placeholder="9876543210 or +919876543210" />
        <p className="mt-1 text-xs text-gray-500">
          10-digit Indian number accepted. Country code added automatically.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
          <Input {...register('department')} placeholder="Engineering" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
          <Input {...register('designation')} placeholder="Software Developer" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Monthly Salary (₹) <span className="text-red-500">*</span>
          </label>
          <Input type="number" min={0} step={500} {...register('monthlySalary')}
            error={!!errors.monthlySalary} placeholder="50000" />
          {errors.monthlySalary && <p className="mt-1 text-xs text-red-600">{errors.monthlySalary.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date of Joining <span className="text-red-500">*</span>
          </label>
          <Input type="date" max={today()} {...register('dateOfJoining')}
            error={!!errors.dateOfJoining} />
          {errors.dateOfJoining && <p className="mt-1 text-xs text-red-600">{errors.dateOfJoining.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <Select {...register('role')} error={!!errors.role}>
          <option value="employee">Employee</option>
          <option value="executive">Executive (Work Desk)</option>
          <option value="manager">Manager (Work Desk)</option>
          <option value="admin">Admin (Attendance + Work Desk)</option>
          <option value="super_admin">Super Admin</option>
        </Select>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Bypass attendance location check</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Field / Sales employees — check-in bypasses all location checks (geofence and office IP).
            </p>
          </div>
          <button
            type="button"
            role="checkbox"
            aria-checked={!!allowOutsideGeofence}
            onClick={() => setValue('allowOutsideGeofence', !allowOutsideGeofence, { shouldDirty: true })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${allowOutsideGeofence ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${allowOutsideGeofence ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" loading={submitting}>Create Employee</Button>
      </div>
    </form>
  );
}

// ── Edit Form ─────────────────────────────────────────────────────────────

function EditEmployeeForm({ employee, onSuccess }: { employee: Employee; onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [showComponents, setShowComponents] = useState(!!(employee as { salaryComponents?: object }).salaryComponents);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName:            employee.firstName,
      lastName:             employee.lastName,
      phone:                employee.phone ?? '',
      department:           employee.department ?? '',
      designation:          employee.designation ?? '',
      monthlySalary:        employee.monthlySalary,
      salaryComponents:     (employee as { salaryComponents?: EditForm['salaryComponents'] }).salaryComponents,
      allowOutsideGeofence: employee.allowOutsideGeofence ?? false,
    },
  });
  const allowOutsideGeofence = watch('allowOutsideGeofence');

  const onSubmit = async (data: EditForm) => {
    setSubmitting(true);
    try {
      const phone = normalizePhone(data.phone);
      if (data.phone?.trim() && !E164_REGEX.test(phone ?? '')) {
        toast.error('Phone number could not be parsed. Use format: 9876543210 or +919876543210');
        return;
      }
      await apiFetch(`/api/v1/employees/${employee.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName:            data.firstName?.trim(),
          lastName:             data.lastName?.trim(),
          phone,
          department:           data.department?.trim() || null,
          designation:          data.designation?.trim() || null,
          monthlySalary:        data.monthlySalary,
          salaryComponents:     showComponents ? data.salaryComponents : undefined,
          allowOutsideGeofence: data.allowOutsideGeofence,
        }),
      });
      toast.success('Employee updated');
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? 'Failed to update employee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg text-sm">
        <div>
          <span className="text-gray-500 block text-xs mb-0.5">Employee ID</span>
          <span className="font-mono text-gray-800">{employee.employeeId}</span>
        </div>
        <div>
          <span className="text-gray-500 block text-xs mb-0.5">Email</span>
          <span className="text-gray-800">{employee.email}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <Input {...register('firstName')} error={!!errors.firstName} />
          {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <Input {...register('lastName')} error={!!errors.lastName} />
          {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <Input type="tel" {...register('phone')} placeholder="9876543210 or +919876543210" />
        <p className="mt-1 text-xs text-gray-500">
          10-digit Indian number accepted. Leave blank to remove.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
          <Input {...register('department')} placeholder="Engineering" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
          <Input {...register('designation')} placeholder="Software Developer" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Monthly Salary (₹)
        </label>
        <Input type="number" min={0} step={500} {...register('monthlySalary')}
          error={!!errors.monthlySalary} />
        {errors.monthlySalary && <p className="mt-1 text-xs text-red-600">{errors.monthlySalary.message}</p>}
      </div>

      {/* Salary Component Breakdown (optional) */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowComponents(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <span>Salary Component Breakdown <span className="text-gray-400 font-normal">(optional)</span></span>
          <span className="text-gray-400 text-xs">{showComponents ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showComponents && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Basic</label>
              <Input type="number" min={0} step={100} {...register('salaryComponents.basic')} placeholder="e.g. 25000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">HRA</label>
              <Input type="number" min={0} step={100} {...register('salaryComponents.hra')} placeholder="e.g. 10000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Special Allowance</label>
              <Input type="number" min={0} step={100} {...register('salaryComponents.specialAllowance')} placeholder="e.g. 10000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Other Allowances</label>
              <Input type="number" min={0} step={100} {...register('salaryComponents.otherAllowances')} placeholder="e.g. 5000" />
            </div>
            <p className="col-span-2 text-xs text-gray-400">Components are informational only. Monthly Salary (gross) is used for payroll calculation.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Bypass attendance location check</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Field / Sales employees — check-in bypasses all location checks (geofence and office IP).
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={allowOutsideGeofence}
          onClick={() => setValue('allowOutsideGeofence', !allowOutsideGeofence, { shouldDirty: true })}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${allowOutsideGeofence ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${allowOutsideGeofence ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" loading={submitting}>Save Changes</Button>
      </div>
    </form>
  );
}

// ── Public export ─────────────────────────────────────────────────────────

interface Props { employee?: Employee; onSuccess: () => void }

export default function EmployeeForm({ employee, onSuccess }: Props) {
  if (employee) return <EditEmployeeForm employee={employee} onSuccess={onSuccess} />;
  return <CreateEmployeeForm onSuccess={onSuccess} />;
}
