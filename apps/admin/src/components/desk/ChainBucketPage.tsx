'use client';
/**
 * Shared stage-inbox page for the Work Desk (Phases 30.06\u201330.08).
 *
 * The Purchase Orders, Tax Invoices, Sales Orders, Transit and Payments pages are
 * all the same thing: the chain list filtered to one stage of the pipeline, with
 * the columns that matter at that stage. One component keeps them consistent and
 * means a fix to any of them fixes all of them.
 *
 * Read-only by design \u2014 every action lives on the chain detail page, so there is
 * exactly one place where a chain can be changed.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { type LucideIcon, Search, PauseCircle } from 'lucide-react';
import { format } from 'date-fns';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Input } from '@components/ui/input';
import StatusBadge from '@components/shared/StatusBadge';
import Pagination from '@components/shared/Pagination';
import EmptyState from '@components/shared/EmptyState';
import { TableSkeleton } from '@components/ui/skeleton';
import { apiFetch } from '@lib/utils/api-client';
import { usePagination } from '@/hooks/usePagination';

export type BucketKey =
  | 'po' | 'altered' | 'taxInvoice' | 'portal' | 'so' | 'transit' | 'payment' | 'commission';

type Ref = { _id: string; code?: string; name?: string } | string;

interface Chain {
  _id: string;
  chainNumber: string;
  status: string;
  canteenId?: Ref;
  manufacturerId?: Ref;
  sourcePoNumber?: string;
  sourcePoDate?: string;
  originalOrderValue?: number;
  alteredOrderValue?: number;
  taxInvoiceNumber?: string;
  taxInvoiceDate?: string;
  taxInvoiceValue?: number;
  portalUploadedAt?: string;
  portalApprovedAt?: string;
  soNumber?: string;
  soDate?: string;
  dispatch?: {
    transporter?: string;
    lrNumber?: string;
    dispatchedAt?: string;
    expectedDeliveryAt?: string;
  };
  deliveredAt?: string;
  canteenPayment?: { status?: string; amount?: number; paidAt?: string; referenceNo?: string };
  commission?: {
    computedAmount?: number;
    invoiceNumber?: string;
    raisedAt?: string;
    receivedAt?: string;
    receivedAmount?: number;
  };
  isOnHold?: boolean;
  createdAt: string;
}

interface ApiResp {
  success: boolean;
  data: Chain[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

let _debounce: ReturnType<typeof setTimeout> | null = null;

function refName(ref: Ref | undefined, fallback = '\u2014') {
  if (!ref) return fallback;
  if (typeof ref === 'string') return ref;
  if (ref.code && ref.name) return `${ref.code} \u2013 ${ref.name}`;
  return ref.name ?? fallback;
}

function money(v?: number) {
  if (v === undefined || v === null) return '\u2014';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(d?: string) {
  if (!d) return '\u2014';
  try {
    return format(new Date(d), 'dd MMM yyyy');
  } catch {
    return d;
  }
}

/** Column definitions per stage. Kept as data so the table body stays generic. */
type Column = { header: string; align?: 'right'; render: (c: Chain) => React.ReactNode };

const COMMON: Column[] = [
  {
    header: 'Canteen',
    render: (c) => <span className="text-xs text-gray-700">{refName(c.canteenId)}</span>,
  },
  {
    header: 'Manufacturer',
    render: (c) => <span className="text-xs text-gray-700">{refName(c.manufacturerId)}</span>,
  },
];

const BUCKET_COLUMNS: Record<BucketKey, Column[]> = {
  po: [
    ...COMMON,
    { header: 'Source PO', render: (c) => <span className="text-xs text-gray-600">{c.sourcePoNumber ?? '\u2014'}</span> },
    { header: 'PO Date', render: (c) => <span className="text-gray-600">{fmt(c.sourcePoDate)}</span> },
    { header: 'PO Value', align: 'right', render: (c) => <span className="tabular-nums">{money(c.originalOrderValue)}</span> },
  ],
  altered: [
    ...COMMON,
    { header: 'Source PO', render: (c) => <span className="text-xs text-gray-600">{c.sourcePoNumber ?? '\u2014'}</span> },
    { header: 'PO Value', align: 'right', render: (c) => <span className="tabular-nums text-gray-500">{money(c.originalOrderValue)}</span> },
    { header: 'Altered Value', align: 'right', render: (c) => <span className="tabular-nums font-medium">{money(c.alteredOrderValue)}</span> },
  ],
  taxInvoice: [
    ...COMMON,
    { header: 'Invoice No.', render: (c) => <span className="text-xs text-gray-600">{c.taxInvoiceNumber ?? '\u2014'}</span> },
    { header: 'Invoice Date', render: (c) => <span className="text-gray-600">{fmt(c.taxInvoiceDate)}</span> },
    { header: 'Invoice Value', align: 'right', render: (c) => <span className="tabular-nums">{money(c.taxInvoiceValue)}</span> },
  ],
  portal: [
    ...COMMON,
    { header: 'Invoice No.', render: (c) => <span className="text-xs text-gray-600">{c.taxInvoiceNumber ?? '\u2014'}</span> },
    { header: 'Uploaded', render: (c) => <span className="text-gray-600">{fmt(c.portalUploadedAt)}</span> },
    { header: 'Approved', render: (c) => <span className="text-gray-600">{fmt(c.portalApprovedAt)}</span> },
  ],
  so: [
    ...COMMON,
    { header: 'SO Number', render: (c) => <span className="text-xs text-gray-600">{c.soNumber ?? '\u2014'}</span> },
    { header: 'SO Date', render: (c) => <span className="text-gray-600">{fmt(c.soDate)}</span> },
    { header: 'Order Value', align: 'right', render: (c) => <span className="tabular-nums">{money(c.alteredOrderValue)}</span> },
  ],
  transit: [
    ...COMMON,
    { header: 'Transporter', render: (c) => <span className="text-xs text-gray-600">{c.dispatch?.transporter ?? '\u2014'}</span> },
    { header: 'LR No.', render: (c) => <span className="text-xs text-gray-600">{c.dispatch?.lrNumber ?? '\u2014'}</span> },
    { header: 'Dispatched', render: (c) => <span className="text-gray-600">{fmt(c.dispatch?.dispatchedAt)}</span> },
    { header: 'Expected', render: (c) => <span className="text-gray-600">{fmt(c.dispatch?.expectedDeliveryAt)}</span> },
  ],
  payment: [
    ...COMMON,
    { header: 'Order Value', align: 'right', render: (c) => <span className="tabular-nums text-gray-500">{money(c.alteredOrderValue)}</span> },
    { header: 'Paid', align: 'right', render: (c) => <span className="tabular-nums">{money(c.canteenPayment?.amount)}</span> },
    {
      header: 'Payment',
      render: (c) => (c.canteenPayment?.status ? <StatusBadge status={c.canteenPayment.status} /> : <span>{'\u2014'}</span>),
    },
    { header: 'Reference', render: (c) => <span className="text-xs text-gray-500">{c.canteenPayment?.referenceNo ?? '\u2014'}</span> },
  ],
  commission: [
    ...COMMON,
    { header: 'Invoice No.', render: (c) => <span className="text-xs text-gray-600">{c.commission?.invoiceNumber ?? '\u2014'}</span> },
    { header: 'Commission', align: 'right', render: (c) => <span className="tabular-nums font-medium">{money(c.commission?.computedAmount)}</span> },
    { header: 'Received', align: 'right', render: (c) => <span className="tabular-nums">{money(c.commission?.receivedAmount)}</span> },
    { header: 'Raised', render: (c) => <span className="text-gray-600">{fmt(c.commission?.raisedAt)}</span> },
  ],
};

interface Props {
  title: string;
  bucket: BucketKey;
  basePath: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}

export default function ChainBucketPage({
  title,
  bucket,
  basePath,
  icon,
  emptyTitle,
  emptyDescription,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { page, limit, setPage, buildQuery } = usePagination(20);

  const search = params.get('search') ?? '';
  const query = buildQuery({ bucket, search: search || undefined });

  const { data, isLoading } = useSWR<ApiResp>(
    `/api/v1/ops/chains?${query}`,
    (url: string) => apiFetch<ApiResp>(url),
  );

  const items = data?.data ?? [];
  const pagination = data?.pagination;
  const columns = BUCKET_COLUMNS[bucket];
  const colCount = columns.length + 2; // chain number + status

  const updateSearch = (value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set('search', value);
    else sp.delete('search');
    sp.set('page', '1');
    router.push(`${basePath}?${sp.toString()}`);
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: title }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          <p className="text-xs text-gray-400">Open a chain to record the next step</p>
        </div>

        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-8"
            placeholder="Search chain or PO number\u2026"
            defaultValue={search}
            onChange={(e) => {
              if (_debounce) clearTimeout(_debounce);
              _debounce = setTimeout(() => updateSearch(e.target.value), 400);
            }}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Chain</th>
                {columns.map((col) => (
                  <th
                    key={col.header}
                    className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.header}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton rows={8} cols={colCount} />
            ) : items.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={colCount}>
                    <EmptyState
                      icon={icon}
                      title={emptyTitle}
                      description={emptyDescription}
                      filtered={Boolean(search)}
                      onClearFilters={() => router.push(basePath)}
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c._id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/desk/chains/${c._id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900">{c.chainNumber}</span>
                        {c.isOnHold && <PauseCircle className="h-3.5 w-3.5 text-orange-500" />}
                      </div>
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.header}
                        className={`px-4 py-3 text-gray-700 ${col.align === 'right' ? 'text-right' : ''}`}
                      >
                        {col.render(c)}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <StatusBadge status={c.isOnHold ? 'ON_HOLD' : c.status} />
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
    </AdminLayout>
  );
}
