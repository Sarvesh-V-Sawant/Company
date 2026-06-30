'use client';
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Skeleton } from '@components/ui/skeleton';
import { Dialog } from '@components/ui/dialog';
import { apiFetch } from '@lib/utils/api-client';
import { useDeviceRequests } from '@/hooks/useDeviceRequests';
import type { DeviceRequestItem } from '@app-types/api';

type StatusTab = 'pending' | 'approved' | 'rejected';

function StatusBadge({ status }: { status: DeviceRequestItem['status'] }) {
  const map = {
    pending:  'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  } as const;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: DeviceRequestItem['type'] }) {
  if (type === 'replacement') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3 w-3" /> Replacement
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
      First Device
    </span>
  );
}

interface ApproveDialogState { open: boolean; request: DeviceRequestItem | null; note: string }
interface RejectDialogState  { open: boolean; request: DeviceRequestItem | null; reason: string }

export default function DeviceRequestsPage() {
  const [tab, setTab]       = useState<StatusTab>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const [approve, setApprove] = useState<ApproveDialogState>({ open: false, request: null, note: '' });
  const [reject, setReject]   = useState<RejectDialogState>({ open: false, request: null, reason: '' });
  const [actioning, setActioning] = useState(false);

  const { requests, pagination, isLoading, refresh } = useDeviceRequests({
    status: tab,
    page,
    limit: 20,
    search: search || undefined,
  });

  const handleApprove = async () => {
    if (!approve.request) return;
    setActioning(true);
    try {
      await apiFetch(`/api/v1/devices/requests/${approve.request._id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ approvalNote: approve.note || undefined }),
      });
      toast.success('Device request approved.');
      setApprove({ open: false, request: null, note: '' });
      refresh();
    } catch {
      toast.error('Failed to approve request.');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async () => {
    if (!reject.request) return;
    if (reject.reason.length < 10) { toast.error('Rejection reason must be at least 10 characters.'); return; }
    setActioning(true);
    try {
      await apiFetch(`/api/v1/devices/requests/${reject.request._id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ rejectionReason: reject.reason }),
      });
      toast.success('Device request rejected.');
      setReject({ open: false, request: null, reason: '' });
      refresh();
    } catch {
      toast.error('Failed to reject request.');
    } finally {
      setActioning(false);
    }
  };

  const tabs: StatusTab[] = ['pending', 'approved', 'rejected'];

  return (
    <AdminLayout breadcrumb={[{ label: 'Device Requests' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Device Requests</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <Input
          placeholder="Search by email, device name, manufacturer…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No {tab} device requests.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Device</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fingerprint</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Requested</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  {tab === 'pending' && <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((req) => (
                  <tr key={req._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{req.email}</p>
                      <p className="text-xs text-gray-500">{req.platform}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{req.deviceName}</p>
                      <p className="text-xs text-gray-500">{req.manufacturer} {req.deviceModel} · Android {req.androidVersion}</p>
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={req.type} /></td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-600">{req.fingerprintHash.slice(0, 12)}…</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {format(parseISO(req.requestedAt), 'dd MMM yyyy HH:mm')}
                      {req.requestCount > 1 && (
                        <span className="ml-1 text-xs text-amber-600">×{req.requestCount}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={req.status} />
                      {req.rejectionReason && (
                        <p className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate" title={req.rejectionReason}>
                          {req.rejectionReason}
                        </p>
                      )}
                    </td>
                    {tab === 'pending' && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => setApprove({ open: true, request: req, note: '' })}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setReject({ open: true, request: req, reason: '' })}
                          >
                            <X className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog
        open={approve.open}
        onClose={() => setApprove({ open: false, request: null, note: '' })}
        title="Approve Device Request"
        footer={
          <>
            <Button variant="outline" onClick={() => setApprove({ open: false, request: null, note: '' })} disabled={actioning}>Cancel</Button>
            <Button onClick={handleApprove} loading={actioning}>Approve</Button>
          </>
        }
      >
        {approve.request && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Approve {approve.request.type === 'replacement' ? 'replacement' : 'first device'} request for <strong>{approve.request.email}</strong>?
            </p>
            <p className="text-sm text-gray-600">Device: <strong>{approve.request.deviceName}</strong> ({approve.request.manufacturer} {approve.request.deviceModel})</p>
            {approve.request.type === 'replacement' && (
              <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">This will revoke the currently registered device and all active sessions.</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Approval note (optional)</label>
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                value={approve.note}
                onChange={(e) => setApprove(s => ({ ...s, note: e.target.value }))}
                placeholder="Optional note…"
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={reject.open}
        onClose={() => setReject({ open: false, request: null, reason: '' })}
        title="Reject Device Request"
        footer={
          <>
            <Button variant="outline" onClick={() => setReject({ open: false, request: null, reason: '' })} disabled={actioning}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} loading={actioning}>Reject</Button>
          </>
        }
      >
        {reject.request && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Reject device request from <strong>{reject.request.email}</strong>?</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rejection reason <span className="text-red-500">*</span></label>
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={reject.reason}
                onChange={(e) => setReject(s => ({ ...s, reason: e.target.value }))}
                placeholder="Explain why the request is rejected (min 10 chars)…"
              />
              {reject.reason.length > 0 && reject.reason.length < 10 && (
                <p className="text-xs text-red-500 mt-1">{10 - reject.reason.length} more characters required.</p>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </AdminLayout>
  );
}
