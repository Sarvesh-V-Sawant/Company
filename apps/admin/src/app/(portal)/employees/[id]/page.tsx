'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Pencil, Smartphone, ShieldOff, Clock, Check, X, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Sheet } from '@components/ui/sheet';
import { ConfirmDialog, Dialog } from '@components/ui/dialog';
import StatusBadge from '@components/shared/StatusBadge';
import { Skeleton } from '@components/ui/skeleton';
import EmployeeForm from '@components/forms/EmployeeForm';
import { useEmployee } from '@/hooks/useEmployees';
import { apiFetch } from '@lib/utils/api-client';
import type { DeviceHistoryItem, RegisteredDeviceItem, DeviceRequestItem } from '@app-types/api';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start py-3 border-b border-gray-100 last:border-0">
      <dt className="w-40 shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

interface DeviceHistoryResponse {
  success: boolean;
  data: { registeredDevice: RegisteredDeviceItem | null; deviceHistory: DeviceHistoryItem[] };
}

interface PendingRequestsResponse {
  success: boolean;
  data: DeviceRequestItem[];
  pagination: { total: number };
}

function DeviceSection({ employeeId }: { employeeId: string }) {
  const [approveState, setApproveState] = useState<{ open: boolean; request: DeviceRequestItem | null; note: string }>({ open: false, request: null, note: '' });
  const [rejectState, setRejectState]   = useState<{ open: boolean; request: DeviceRequestItem | null; reason: string }>({ open: false, request: null, reason: '' });
  const [revokeOpen, setRevokeOpen]     = useState(false);
  const [actioning, setActioning]       = useState(false);

  const { data: historyData, mutate: refreshHistory } = useSWR<DeviceHistoryResponse>(
    `/api/v1/devices/history?userId=${employeeId}`,
    (url: string) => apiFetch<DeviceHistoryResponse>(url),
  );

  const { data: pendingData, mutate: refreshPending } = useSWR<PendingRequestsResponse>(
    `/api/v1/devices/requests?status=pending&userId=${employeeId}&limit=10`,
    (url: string) => apiFetch<PendingRequestsResponse>(url),
  );

  const device   = historyData?.data?.registeredDevice ?? null;
  const history  = historyData?.data?.deviceHistory ?? [];
  const pending  = pendingData?.data ?? [];

  const handleApprove = async () => {
    if (!approveState.request) return;
    setActioning(true);
    try {
      await apiFetch(`/api/v1/devices/requests/${approveState.request._id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ approvalNote: approveState.note || undefined }),
      });
      toast.success('Device request approved.');
      setApproveState({ open: false, request: null, note: '' });
      refreshHistory();
      refreshPending();
    } catch {
      toast.error('Failed to approve request.');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async () => {
    if (!rejectState.request) return;
    if (rejectState.reason.length < 10) { toast.error('Reason must be at least 10 characters.'); return; }
    setActioning(true);
    try {
      await apiFetch(`/api/v1/devices/requests/${rejectState.request._id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ rejectionReason: rejectState.reason }),
      });
      toast.success('Device request rejected.');
      setRejectState({ open: false, request: null, reason: '' });
      refreshPending();
    } catch {
      toast.error('Failed to reject request.');
    } finally {
      setActioning(false);
    }
  };

  const handleRevoke = async () => {
    setActioning(true);
    try {
      await apiFetch(`/api/v1/employees/${employeeId}/reset-device`, { method: 'PATCH' });
      toast.success('Device registration revoked.');
      setRevokeOpen(false);
      refreshHistory();
    } catch {
      toast.error('Failed to revoke device.');
    } finally {
      setActioning(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Smartphone className="h-4 w-4" /> Device
        </h2>
        {device && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => setRevokeOpen(true)}
          >
            <ShieldOff className="h-3.5 w-3.5 mr-1" /> Revoke Device
          </Button>
        )}
      </div>

      {/* Registered device */}
      {device ? (
        <dl>
          <Row label="Device"       value={device.deviceInfo} />
          <Row label="Platform"     value={<span className="capitalize">{device.platform}</span>} />
          <Row label="Fingerprint"  value={<span className="font-mono text-xs">{device.fingerprintHash.slice(0, 16)}…</span>} />
          <Row label="Registered"   value={format(parseISO(device.registeredAt), 'dd MMM yyyy HH:mm')} />
        </dl>
      ) : (
        <p className="text-sm text-gray-500">No device registered.</p>
      )}

      {/* Pending requests */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" /> Pending Device Requests
          </h3>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req._id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{req.deviceName}</p>
                  <p className="text-xs text-gray-500">{req.manufacturer} · {req.platform} · {req.type === 'replacement' ? 'Replacement' : 'First device'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{format(parseISO(req.requestedAt), 'dd MMM yyyy HH:mm')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => setApproveState({ open: true, request: req, note: '' })}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => setRejectState({ open: true, request: req, reason: '' })}>
                    <X className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Device history */}
      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Device History</h3>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Device</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Platform</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Registered</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Revoked</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((h, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono">{h.fingerprintHash.slice(0, 10)}…</td>
                    <td className="px-3 py-2 capitalize">{h.platform}</td>
                    <td className="px-3 py-2">{format(parseISO(h.registeredAt), 'dd MMM yy')}</td>
                    <td className="px-3 py-2">{h.revokedAt ? format(parseISO(h.revokedAt), 'dd MMM yy') : '—'}</td>
                    <td className="px-3 py-2 capitalize">{h.revokedReason.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approve inline dialog */}
      <Dialog
        open={approveState.open}
        onClose={() => setApproveState({ open: false, request: null, note: '' })}
        title="Approve Device Request"
        footer={
          <>
            <Button variant="outline" onClick={() => setApproveState({ open: false, request: null, note: '' })} disabled={actioning}>Cancel</Button>
            <Button onClick={handleApprove} loading={actioning}>Approve</Button>
          </>
        }
      >
        {approveState.request && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Approve <strong>{approveState.request.deviceName}</strong> ({approveState.request.manufacturer})?</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                value={approveState.note}
                onChange={(e) => setApproveState(s => ({ ...s, note: e.target.value }))}
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Reject inline dialog */}
      <Dialog
        open={rejectState.open}
        onClose={() => setRejectState({ open: false, request: null, reason: '' })}
        title="Reject Device Request"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectState({ open: false, request: null, reason: '' })} disabled={actioning}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} loading={actioning}>Reject</Button>
          </>
        }
      >
        {rejectState.request && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Rejection reason <span className="text-red-500">*</span></label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={rejectState.reason}
              onChange={(e) => setRejectState(s => ({ ...s, reason: e.target.value }))}
            />
          </div>
        )}
      </Dialog>

      {/* Revoke device confirm */}
      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={handleRevoke}
        title="Revoke Device"
        description="This will remove the registered device and revoke all active sessions. The employee will need to re-register their device."
        confirmLabel="Revoke"
        destructive
        loading={actioning}
      />
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { employee, isLoading, error } = useEmployee(id);
  const [editOpen, setEditOpen]         = useState(false);
  const [toggleOpen, setToggleOpen]     = useState(false);
  const [toggling, setToggling]         = useState(false);
  const [resendOpen, setResendOpen]     = useState(false);
  const [resending, setResending]       = useState(false);

  const handleResendSetup = async () => {
    setResending(true);
    try {
      const res = await apiFetch<{ success: boolean; error?: { message: string } }>(
        `/api/v1/employees/${id}/resend-setup-link`,
        { method: 'POST' },
      );
      if (!res.success) {
        toast.error(res.error?.message ?? 'Failed to send setup link.');
        return;
      }
      toast.success('Password setup link sent.');
      setResendOpen(false);
    } catch {
      toast.error('Failed to send setup link.');
    } finally {
      setResending(false);
    }
  };

  const handleToggle = async () => {
    if (!employee) return;
    setToggling(true);
    try {
      const action = employee.isActive ? 'deactivate' : 'activate';
      await apiFetch(`/api/v1/employees/${id}/${action}`, { method: 'PATCH' });
      toast.success(`Employee ${employee.isActive ? 'deactivated' : 'activated'}`);
      setToggleOpen(false);
      window.location.reload();
    } catch { toast.error('Failed to update status'); }
    finally { setToggling(false); }
  };

  if (isLoading) {
    return (
      <AdminLayout breadcrumb={[{ label: 'Employees', href: '/employees' }, { label: '…' }]}>
        <div className="space-y-4 max-w-2xl">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !employee) {
    return (
      <AdminLayout breadcrumb={[{ label: 'Employees', href: '/employees' }, { label: 'Not Found' }]}>
        <p className="text-sm text-gray-500">Employee not found.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Employees', href: '/employees' }, { label: `${employee.firstName} ${employee.lastName}` }]}>
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">{employee.firstName} {employee.lastName}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setResendOpen(true)}>
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Resend Setup Link
            </Button>
            <Button variant="outline" size="sm" onClick={() => setToggleOpen(true)}>
              {employee.isActive ? 'Deactivate' : 'Activate'}
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1.5" /> Edit
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <dl>
            <Row label="Employee ID"  value={<span className="font-mono text-xs">{employee.employeeId}</span>} />
            <Row label="Name"         value={`${employee.firstName} ${employee.lastName}`} />
            <Row label="Email"        value={employee.email} />
            <Row label="Phone"        value={employee.phone} />
            <Row label="Department"   value={employee.department} />
            <Row label="Designation"  value={employee.designation} />
            <Row label="Role"              value={<span className="capitalize">{employee.role}</span>} />
            <Row label="Status"            value={<StatusBadge status={employee.isActive ? 'active' : 'inactive'} />} />
            <Row label="Field Employee"    value={
              employee.allowOutsideGeofence
                ? <span className="inline-flex items-center gap-1 text-blue-700 font-medium">✓ Geofence bypass enabled</span>
                : <span className="text-gray-400">Office-only (geofence enforced)</span>
            } />
            <Row label="Joining Date" value={employee.dateOfJoining ? format(parseISO(employee.dateOfJoining), 'dd MMM yyyy') : undefined} />
            <Row label="Created"      value={format(parseISO(employee.createdAt), 'dd MMM yyyy')} />
          </dl>
        </div>

        <DeviceSection employeeId={id} />
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit Employee">
        <EmployeeForm employee={employee} onSuccess={() => { setEditOpen(false); window.location.reload(); }} />
      </Sheet>

      <ConfirmDialog
        open={resendOpen}
        onClose={() => setResendOpen(false)}
        onConfirm={handleResendSetup}
        title="Resend Setup Link"
        description={`Send a new password setup link to ${employee.firstName} ${employee.lastName} (${employee.email})? Any previous setup link will be invalidated.`}
        confirmLabel="Send Link"
        loading={resending}
      />

      <ConfirmDialog
        open={toggleOpen}
        onClose={() => setToggleOpen(false)}
        onConfirm={handleToggle}
        title={employee.isActive ? 'Deactivate Employee' : 'Activate Employee'}
        description={`Are you sure you want to ${employee.isActive ? 'deactivate' : 'activate'} ${employee.firstName} ${employee.lastName}?`}
        confirmLabel={employee.isActive ? 'Deactivate' : 'Activate'}
        destructive={employee.isActive}
        loading={toggling}
      />
    </AdminLayout>
  );
}
