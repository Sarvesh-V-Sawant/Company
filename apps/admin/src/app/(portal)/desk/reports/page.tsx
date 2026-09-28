'use client';
/**
 * Work Desk reports (Phase 30.09).
 *
 * Five views over the same scoped data set. Every figure comes from a server-side
 * aggregation, so the totals do not depend on the page size.
 */
import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import StatusBadge from '@components/shared/StatusBadge';
import EmptyState from '@components/shared/EmptyState';
import { Skeleton } from '@components/ui/skeleton';
import { apiFetch } from '@lib/utils/api-client';

type ReportKey = 'pipeline' | 'commission' | 'manufacturer' | 'canteen' | 'shortSupply' | 'ageing';

const REPORTS: Array<{ key: ReportKey; label: string; blurb: string }> = [
  { key: 'pipeline', label: 'Pipeline by status', blurb: 'Where every open chain currently sits.' },
  { key: 'ageing', label: 'Ageing of open chains', blurb: 'What has been sitting too long, oldest first.' },
  { key: 'commission', label: 'Commission raised vs received', blurb: 'Outstanding commission by manufacturer.' },
  { key: 'manufacturer', label: 'By manufacturer', blurb: 'Volume and value per manufacturer.' },
  { key: 'canteen', label: 'By canteen', blurb: 'Volume, value and payment position per canteen.' },
  { key: 'shortSupply', label: 'Short supply', blurb: 'Lines delivered below the agreed quantity.' },
];

interface PipelineData {
  report: 'pipeline';
  byStatus: Array<{ status: string; count: number; originalValue: number; alteredValue: number; onHold: number }>;
  totals: { count: number; originalValue: number; alteredValue: number; onHold: number; alterationDelta: number };
}
interface CommissionData {
  report: 'commission';
  byManufacturer: Array<{
    manufacturerId: string | null; manufacturerName: string;
    raisedCount: number; raisedAmount: number;
    receivedCount: number; receivedAmount: number; outstanding: number;
  }>;
  totals: { raisedAmount: number; receivedAmount: number; outstanding: number };
}
interface MfrData {
  report: 'manufacturer';
  rows: Array<{ manufacturerId: string; code: string; name: string; chains: number; alteredValue: number; delivered: number; cancelled: number }>;
}
interface CanteenData {
  report: 'canteen';
  rows: Array<{ canteenId: string; code: string; name: string; chains: number; alteredValue: number; paidAmount: number; unpaidChains: number }>;
}
interface ShortSupplyData {
  report: 'shortSupply';
  rows: Array<{
    chainId: string; chainNumber: string; status: string; item: string; uom: string;
    agreedQty: number; deliveredQty: number; shortQty: number; shortValue: number;
  }>;
  totals: { lines: number; shortValue: number };
}
interface AgeingData {
  report: 'ageing';
  byBucket: Array<{
    bucket: string; count: number;
    chains: Array<{ id: string; chainNumber: string; status: string; ageDays: number; isOnHold: boolean }>;
  }>;
  totalOpen: number;
}

type ReportData = PipelineData | CommissionData | MfrData | CanteenData | ShortSupplyData | AgeingData;

function money(v?: number) {
  if (v === undefined || v === null) return '\u2014';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function DeskReportsPage() {
  const [report, setReport] = useState<ReportKey>('pipeline');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const qp = new URLSearchParams({ report });
  if (fromDate) qp.set('fromDate', fromDate);
  if (toDate) qp.set('toDate', toDate);

  const { data, isLoading, error } = useSWR<{ success: boolean; data: ReportData }>(
    `/api/v1/ops/reports?${qp.toString()}`,
    (url: string) => apiFetch<{ success: boolean; data: ReportData }>(url),
  );

  const active = REPORTS.find((r) => r.key === report)!;
  const d = data?.data;

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Reports' }]}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">{active.blurb}</p>
        </div>

        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Report</label>
            <Select value={report} onChange={(e) => setReport(e.target.value as ReportKey)} className="w-64">
              {REPORTS.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </Select>
          </div>
          {report !== 'ageing' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">From</label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">To</label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
              </div>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error || !d ? (
          <div className="bg-white rounded-xl border border-gray-200">
            <EmptyState
              icon={BarChart3}
              title="Report could not be loaded"
              description={error instanceof Error ? error.message : 'Try a different date range.'}
            />
          </div>
        ) : (
          <>
            {d.report === 'pipeline' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card label="Chains" value={String(d.totals.count)} />
                  <Card label="PO value" value={money(d.totals.originalValue)} />
                  <Card label="Final value" value={money(d.totals.alteredValue)} />
                  <Card
                    label="Alteration delta"
                    value={money(d.totals.alterationDelta)}
                    tone={d.totals.alterationDelta < 0 ? 'bad' : 'good'}
                  />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr><Th>Status</Th><Th right>Chains</Th><Th right>PO Value</Th><Th right>Final Value</Th><Th right>On Hold</Th></tr>
                    </thead>
                    <tbody>
                      {d.byStatus.map((r) => (
                        <tr key={r.status} className="border-b border-gray-100">
                          <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.count}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-500">{money(r.originalValue)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{money(r.alteredValue)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-orange-600">{r.onHold || '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {d.report === 'ageing' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <Card label="Open chains" value={String(d.totalOpen)} />
                  {d.byBucket.map((b) => (
                    <Card
                      key={b.bucket}
                      label={b.bucket}
                      value={String(b.count)}
                      tone={b.bucket === '30+ days' && b.count > 0 ? 'bad' : undefined}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  {d.byBucket.filter((b) => b.count > 0).map((b) => (
                    <div key={b.bucket} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">{b.bucket}</span>
                        <span className="text-xs text-gray-500">{b.count} chain{b.count === 1 ? '' : 's'}</span>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {b.chains.map((c) => (
                            <tr key={c.id} className="border-b border-gray-100 last:border-0">
                              <td className="px-4 py-2.5 font-medium text-gray-900">{c.chainNumber}</td>
                              <td className="px-4 py-2.5"><StatusBadge status={c.isOnHold ? 'ON_HOLD' : c.status} /></td>
                              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{c.ageDays} days old</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {b.count > b.chains.length && (
                        <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                          Showing the {b.chains.length} oldest of {b.count}. Use the Chains page for the full list.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {d.report === 'commission' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Card label="Raised" value={money(d.totals.raisedAmount)} />
                  <Card label="Received" value={money(d.totals.receivedAmount)} tone="good" />
                  <Card label="Outstanding" value={money(d.totals.outstanding)} tone={d.totals.outstanding > 0 ? 'bad' : undefined} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr><Th>Manufacturer</Th><Th right>Invoices</Th><Th right>Raised</Th><Th right>Received</Th><Th right>Outstanding</Th></tr>
                    </thead>
                    <tbody>
                      {d.byManufacturer.map((r) => (
                        <tr key={r.manufacturerId ?? r.manufacturerName} className="border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-800">{r.manufacturerName}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-500">{r.receivedCount}/{r.raisedCount}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{money(r.raisedAmount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-700">{money(r.receivedAmount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{money(r.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {d.report === 'manufacturer' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr><Th>Code</Th><Th>Manufacturer</Th><Th right>Chains</Th><Th right>Value</Th><Th right>Delivered</Th><Th right>Cancelled</Th></tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.manufacturerId} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-xs text-gray-500">{r.code}</td>
                        <td className="px-4 py-3 text-gray-800">{r.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.chains}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(r.alteredValue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700">{r.delivered}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-400">{r.cancelled || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {d.report === 'canteen' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr><Th>Code</Th><Th>Canteen</Th><Th right>Chains</Th><Th right>Value</Th><Th right>Paid</Th><Th right>Unpaid</Th></tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.canteenId} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-xs text-gray-500">{r.code}</td>
                        <td className="px-4 py-3 text-gray-800">{r.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.chains}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(r.alteredValue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700">{money(r.paidAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-600">{r.unpaidChains || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {d.report === 'shortSupply' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Card label="Short lines" value={String(d.totals.lines)} />
                  <Card label="Short value" value={money(d.totals.shortValue)} tone={d.totals.shortValue > 0 ? 'bad' : undefined} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr><Th>Chain</Th><Th>Item</Th><Th right>Agreed</Th><Th right>Delivered</Th><Th right>Short</Th><Th right>Value</Th></tr>
                    </thead>
                    {d.rows.length === 0 ? (
                      <tbody>
                        <tr><td colSpan={6}>
                          <EmptyState icon={BarChart3} title="No short supply recorded" description="Every delivered line matched the agreed quantity." />
                        </td></tr>
                      </tbody>
                    ) : (
                      <tbody>
                        {d.rows.map((r, i) => (
                          <tr key={`${r.chainId}-${i}`} className="border-b border-gray-100">
                            <td className="px-4 py-3 font-medium text-gray-900">{r.chainNumber}</td>
                            <td className="px-4 py-3 text-xs text-gray-600">{r.item}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-500">{r.agreedQty} {r.uom}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{r.deliveredQty}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-red-600">{r.shortQty}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{money(r.shortValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    )}
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
