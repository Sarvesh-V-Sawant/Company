'use client';
import { useParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import AdminLayout from '@components/layout/AdminLayout';
import { Skeleton } from '@components/ui/skeleton';
import { apiFetch } from '@lib/utils/api-client';
import useSWR from 'swr';

interface UserRef { firstName: string; lastName: string; email: string }
interface AuditLog {
  _id: string;
  userId?: UserRef | string;
  action: string;
  entity: string;
  entityId?: string;
  ip?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
interface Res { success: boolean; data: AuditLog }

const ACTION_COLOR_MAP: [string, string][] = [
  ['CREATED',   'text-green-700 bg-green-50 border border-green-200'],
  ['CREATE',    'text-green-700 bg-green-50 border border-green-200'],
  ['APPROVED',  'text-green-700 bg-green-50 border border-green-200'],
  ['DELETED',   'text-red-700 bg-red-50 border border-red-200'],
  ['DELETE',    'text-red-700 bg-red-50 border border-red-200'],
  ['REJECTED',  'text-red-700 bg-red-50 border border-red-200'],
  ['UPDATED',   'text-blue-700 bg-blue-50 border border-blue-200'],
  ['UPDATE',    'text-blue-700 bg-blue-50 border border-blue-200'],
  ['FINALISED', 'text-purple-700 bg-purple-50 border border-purple-200'],
  ['FINALIZED', 'text-purple-700 bg-purple-50 border border-purple-200'],
  ['LOGIN',     'text-amber-700 bg-amber-50 border border-amber-200'],
  ['LOGOUT',    'text-amber-700 bg-amber-50 border border-amber-200'],
];

function actionColor(action: string): string {
  const upper = action.toUpperCase();
  for (const [key, cls] of ACTION_COLOR_MAP) {
    if (upper.includes(key)) return cls;
  }
  return 'text-gray-700 bg-gray-100 border border-gray-200';
}

function DiffBlock({ label, data }: { label: string; data?: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-gray-500 uppercase mb-2">{label}</p>
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 font-mono text-xs overflow-auto max-h-64 space-y-0.5">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-gray-400 shrink-0 select-none">{k}:</span>
            <span className="text-gray-800 break-all">{JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSWR(
    `/api/v1/audit-logs/${id}`,
    (url: string) => apiFetch<Res>(url),
  );
  const log = data?.data;

  const actorLabel = () => {
    if (!log?.userId) return '—';
    if (typeof log.userId === 'object') {
      const u = log.userId as UserRef;
      return `${u.firstName} ${u.lastName} (${u.email})`;
    }
    return String(log.userId);
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Audit Logs', href: '/audit-logs' }, { label: log?.action ?? 'Detail' }]}>
      <div className="space-y-4 max-w-4xl">
        <Link href="/audit-logs" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Audit Logs
        </Link>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : !log ? (
          <p className="text-sm text-gray-500">Audit log not found.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium font-mono ${actionColor(log.action)}`}>
                {log.action}
              </span>
              <span className="text-sm text-gray-500">
                {format(parseISO(log.createdAt), 'dd MMM yyyy HH:mm:ss')} IST
              </span>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {[
                { label: 'Action',     value: <span className="font-mono text-sm">{log.action}</span> },
                { label: 'Entity',     value: <span className="font-mono text-sm">{log.entity}{log.entityId ? ` / ${log.entityId}` : ''}</span> },
                { label: 'Actor',      value: actorLabel() },
                { label: 'IP Address', value: log.ip ?? '—' },
                { label: 'Timestamp',  value: format(parseISO(log.createdAt), 'dd MMM yyyy HH:mm:ss') },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start px-5 py-3 gap-4">
                  <dt className="w-28 shrink-0 text-sm text-gray-500">{label}</dt>
                  <dd className="text-sm text-gray-900">{value}</dd>
                </div>
              ))}
            </div>

            {(log.before || log.after) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-medium text-gray-700 mb-4">Changes</h2>
                <div className="flex gap-4">
                  <DiffBlock label="Before" data={log.before} />
                  <DiffBlock label="After"  data={log.after}  />
                </div>
              </div>
            )}

            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-medium text-gray-700 mb-3">Metadata</h2>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 font-mono text-xs overflow-auto">
                  <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
