'use client';
/**
 * Work Desk outbox (Phase 30.04).
 *
 * Drafts are created from a chain's detail page. This page is where they are
 * reviewed, edited and sent \u2014 you asked to always see the draft before anything
 * leaves, so sending is a separate, deliberate click here.
 *
 * Sent mail is immutable: no edit, no delete. That is on purpose, because the
 * outbox doubles as the audit record of what the manufacturer was told.
 */
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Search, Send, Paperclip, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { Textarea } from '@components/ui/textarea';
import { Dialog, ConfirmDialog } from '@components/ui/dialog';
import StatusBadge from '@components/shared/StatusBadge';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { TableSkeleton } from '@components/ui/skeleton';
import { deskJson, deskDocumentUrl, deskErrorMessage } from '@lib/utils/desk-api';
import { apiFetch } from '@lib/utils/api-client';
import { usePagination } from '@/hooks/usePagination';

interface Attachment {
  fileName: string;
  format: 'pdf' | 'xlsx';
  documentId?: string;
}

interface EmailRow {
  _id: string;
  chainId?: { _id: string; chainNumber?: string } | string;
  toEmails: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Attachment[];
  status: 'draft' | 'queued' | 'sent' | 'failed' | 'bounced';
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
}

interface ListResp {
  success: boolean;
  data: EmailRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

let _debounce: ReturnType<typeof setTimeout> | null = null;

function chainNumberOf(ref: EmailRow['chainId']): string {
  if (!ref) return '\u2014';
  if (typeof ref === 'string') return '\u2014';
  return ref.chainNumber ?? '\u2014';
}

function chainIdOf(ref: EmailRow['chainId']): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref._id;
}

export default function DeskEmailsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);

  const [open, setOpen] = useState<EmailRow | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editTo, setEditTo] = useState('');
  const [editCc, setEditCc] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState<EmailRow | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<EmailRow | null>(null);

  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const chainId = params.get('chainId') ?? '';

  const query = buildQuery({
    search: search || undefined,
    status: status || undefined,
    chainId: chainId || undefined,
  });

  const { data, isLoading, mutate } = useSWR<ListResp>(
    `/api/v1/ops/emails?${query}`,
    (url: string) => apiFetch<ListResp>(url),
  );

  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.set('page', '1');
    router.push(`/desk/emails?${sp.toString()}`);
  };

  const openMail = (row: EmailRow) => {
    setOpen(row);
    setEditSubject(row.subject);
    setEditBody(row.bodyText ?? '');
    setEditTo(row.toEmails.join(', '));
    setEditCc((row.ccEmails ?? []).join(', '));
  };

  const saveDraft = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await deskJson.patch(`/api/v1/ops/emails/${open._id}`, {
        subject: editSubject,
        bodyText: editBody,
        toEmails: editTo,
        ccEmails: editCc || undefined,
      });
      toast.success('Draft updated');
      setOpen(null);
      mutate();
    } catch (err) {
      toast.error(deskErrorMessage(err, 'Could not update the draft'));
    } finally {
      setBusy(false);
    }
  };

  const doSend = async () => {
    if (!confirmSend) return;
    setBusy(true);
    try {
      await deskJson.post(`/api/v1/ops/emails/${confirmSend._id}/send`);
      toast.success('Email sent');
      setConfirmSend(null);
      setOpen(null);
      mutate();
    } catch (err) {
      // The draft is retained on a provider failure so it can be retried.
      toast.error(deskErrorMessage(err, 'The mail provider rejected the message'));
    } finally {
      setBusy(false);
    }
  };

  const doDiscard = async () => {
    if (!confirmDiscard) return;
    setBusy(true);
    try {
      await deskJson.del(`/api/v1/ops/emails/${confirmDiscard._id}`);
      toast.success('Draft discarded');
      setConfirmDiscard(null);
      setOpen(null);
      mutate();
    } catch (err) {
      toast.error(deskErrorMessage(err, 'Could not discard the draft'));
    } finally {
      setBusy(false);
    }
  };

  const fmt = (d?: string) => {
    if (!d) return '\u2014';
    try {
      return format(new Date(d), 'dd MMM yyyy, HH:mm');
    } catch {
      return d;
    }
  };

  const isDraft = open?.status === 'draft';

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Emails' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Emails</h1>
          <p className="text-xs text-gray-400">Drafts are created from a chain</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-8"
              placeholder="Search subject or recipient\u2026"
              defaultValue={search}
              onChange={(e) => {
                if (_debounce) clearTimeout(_debounce);
                _debounce = setTimeout(() => updateParam('search', e.target.value), 400);
              }}
            />
          </div>
          <Select value={status} onChange={(e) => updateParam('status', e.target.value)} className="w-40">
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="queued">Queued</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="bounced">Bounced</option>
          </Select>
          {chainId && (
            <Button variant="outline" size="sm" onClick={() => updateParam('chainId', '')}>
              Clear chain filter
            </Button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Chain', 'To', 'Subject', 'Attachments', 'Status', 'Sent', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : items.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Mail}
                      title="No emails yet"
                      description="Open a chain and use Email Altered Order to prepare a draft."
                      filtered={Boolean(search || status || chainId)}
                      onClearFilters={() => router.push('/desk/emails')}
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {items.map((m) => (
                  <tr key={m._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {chainIdOf(m.chainId) ? (
                        <button
                          className="text-blue-600 hover:underline font-medium"
                          onClick={() => router.push(`/desk/chains/${chainIdOf(m.chainId)}`)}
                        >
                          {chainNumberOf(m.chainId)}
                        </button>
                      ) : (
                        <span className="text-gray-400">\u2014</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {m.toEmails[0]}
                      {m.toEmails.length > 1 && (
                        <span className="text-gray-400"> +{m.toEmails.length - 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-[280px] truncate">{m.subject}</td>
                    <td className="px-4 py-3">
                      {m.attachments && m.attachments.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Paperclip className="h-3 w-3" />
                          {m.attachments.length}
                        </span>
                      ) : (
                        <span className="text-gray-300">\u2014</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                      {m.status === 'failed' && m.errorMessage && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[160px] truncate" title={m.errorMessage}>
                          {m.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{m.sentAt ? fmt(m.sentAt) : fmt(m.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openMail(m)}>
                        {m.status === 'draft' ? 'Review' : 'View'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {pagination && pagination.pages > 1 && (
            <Pagination
              page={page}
              totalPages={pagination.pages}
              total={pagination.total}
              limit={limit}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={isDraft ? 'Review Draft' : 'Email Details'}
        width="max-w-[640px]"
        footer={
          <div className="flex justify-between w-full">
            <div>
              {isDraft && open && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(open)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Discard
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(null)}>Close</Button>
              {isDraft && (
                <>
                  <Button variant="outline" onClick={saveDraft} disabled={busy}>Save Draft</Button>
                  <Button onClick={() => open && setConfirmSend(open)} disabled={busy}>
                    <Send className="h-3.5 w-3.5 mr-1.5" /> Send
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {open && (
          <div className="space-y-3">
            {!isDraft && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
                This message has already left the system, so it can no longer be edited or deleted.
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">To</label>
              {isDraft ? (
                <Input
                  value={editTo}
                  onChange={(e) => setEditTo(e.target.value)}
                  placeholder="name@example.com, other@example.com"
                />
              ) : (
                <p className="text-sm text-gray-800">{open.toEmails.join(', ')}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Cc</label>
              {isDraft ? (
                <Input value={editCc} onChange={(e) => setEditCc(e.target.value)} placeholder="Optional" />
              ) : (
                <p className="text-sm text-gray-800">
                  {open.ccEmails && open.ccEmails.length > 0 ? open.ccEmails.join(', ') : '\u2014'}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Subject</label>
              {isDraft ? (
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
              ) : (
                <p className="text-sm text-gray-800">{open.subject}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Message</label>
              {isDraft ? (
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="min-h-[180px]"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {open.bodyText ?? '(No plain-text body recorded.)'}
                </pre>
              )}
            </div>

            {open.attachments && open.attachments.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Attachments</label>
                <ul className="space-y-1">
                  {open.attachments.map((a, i) => (
                    <li key={`${a.fileName}-${i}`} className="flex items-center gap-2 text-sm">
                      <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-700">{a.fileName}</span>
                      <span className="text-[10px] uppercase text-gray-400">{a.format}</span>
                      {a.documentId && (
                        <a
                          href={deskDocumentUrl(a.documentId)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-0.5 text-xs"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-1">
                  Attachments are fixed when the draft is created, so what you review is what gets sent.
                </p>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmSend !== null}
        onClose={() => setConfirmSend(null)}
        onConfirm={doSend}
        title="Send this email?"
        description={
          confirmSend
            ? `This will send "${confirmSend.subject}" to ${confirmSend.toEmails.join(', ')}. Sent mail cannot be edited or recalled.`
            : ''
        }
        confirmLabel="Send"
        loading={busy}
      />

      <ConfirmDialog
        open={confirmDiscard !== null}
        onClose={() => setConfirmDiscard(null)}
        onConfirm={doDiscard}
        title="Discard this draft?"
        description="The draft will be removed. Any generated attachment stays in the chain's document vault."
        confirmLabel="Discard"
        destructive
        loading={busy}
      />
    </AdminLayout>
  );
}
