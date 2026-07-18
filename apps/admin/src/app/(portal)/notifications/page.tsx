'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { CheckCheck } from 'lucide-react';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Select } from '@components/ui/select';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { Skeleton } from '@components/ui/skeleton';
import { Badge } from '@components/ui/badge';
import { useNotifications } from '@/hooks/useNotifications';
import { usePagination } from '@/hooks/usePagination';
import { apiFetch } from '@lib/utils/api-client';
import { cn } from '@lib/utils/cn';

function NotificationsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-start gap-4">
          <div className="mt-1.5 h-2 w-2 rounded-full bg-gray-200 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationsPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);

  const isRead = params.get('isRead') ?? '';
  const query  = buildQuery({ isRead: isRead || undefined });
  const { notifications, pagination, isLoading, refresh } = useNotifications(query);

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    sp.set('page', '1');
    router.push(`/notifications?${sp.toString()}`);
  };

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
      refresh();
    } catch { toast.error('Failed to mark as read'); }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/api/v1/notifications/read-all', { method: 'PATCH' });
      toast.success('All notifications marked as read');
      refresh();
    } catch { toast.error('Failed to mark all as read'); }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Notifications' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-1.5" /> Mark All Read
          </Button>
        </div>

        <div className="flex gap-3">
          <Select value={isRead} onChange={e => updateParam('isRead', e.target.value)} className="w-40">
            <option value="">All</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </Select>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <NotificationsSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState title="No notifications" filtered={!!isRead} onClearFilters={() => router.push('/notifications')} />
          ) : (
            notifications.map(n => (
              <div
                key={n._id}
                className={cn(
                  'bg-white rounded-xl border px-5 py-4 flex items-start gap-4',
                  n.isRead ? 'border-gray-200' : 'border-blue-200 bg-blue-50/30',
                )}
              >
                <div className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', n.isRead ? 'bg-transparent' : 'bg-blue-500')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={cn('text-sm font-medium', n.isRead ? 'text-gray-700' : 'text-gray-900')}>{n.title}</p>
                    <Badge variant="muted" className="text-[10px]">{n.type}</Badge>
                  </div>
                  <p className="text-sm text-gray-500">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">{format(parseISO(n.createdAt), 'dd MMM yyyy HH:mm')}</p>
                </div>
                {!n.isRead && (
                  <Button variant="ghost" size="sm" onClick={() => markRead(n._id)} className="shrink-0">Mark Read</Button>
                )}
              </div>
            ))
          )}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="bg-white rounded-xl border border-gray-200">
            <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} limit={limit} onPageChange={setPage} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={
      <AdminLayout breadcrumb={[{ label: 'Notifications' }]}>
        <NotificationsSkeleton />
      </AdminLayout>
    }>
      <NotificationsPageContent />
    </Suspense>
  );
}
