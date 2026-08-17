'use client';
/**
 * Work Desk settings (Phases 30.04 / 30.08).
 *
 * These are the values that were left as open questions pending your CA:
 * the legal document titles, the company identity block printed on generated
 * documents, and how commission is taxed. They are settings rather than
 * hardcoded constants precisely so nothing legal is buried in the codebase.
 *
 * Everyone on the desk can read them; only an administrator can change them.
 */
import { useEffect, useState } from 'react';
import { Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import useSWR from 'swr';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { Textarea } from '@components/ui/textarea';
import { Skeleton } from '@components/ui/skeleton';
import EmptyState from '@components/shared/EmptyState';
import { deskJson, deskErrorMessage } from '@lib/utils/desk-api';
import { apiFetch } from '@lib/utils/api-client';
import { useAuth } from '@/contexts/AuthContext';

interface OpsSettings {
  documentTitles?: {
    alteredOrderTitle?: string;
    commissionInvoiceTitle?: string;
    documentFooterNote?: string;
  };
  commissionTax?: {
    gstApplicable?: boolean;
    gstRatePercent?: number;
    sacCode?: string;
    invoiceNumberPrefix?: string;
  };
  companyIdentity?: {
    legalName?: string;
    gstin?: string;
    addressLines?: string[];
    contactEmail?: string;
    contactPhone?: string;
  };
  alteredOrderEmailSubject?: string;
  alteredOrderEmailBody?: string;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function DeskSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'super_admin';

  const { data, isLoading, error, mutate } = useSWR<{ success: boolean; data: OpsSettings }>(
    '/api/v1/ops/settings',
    (url: string) => apiFetch<{ success: boolean; data: OpsSettings }>(url),
  );

  const [form, setForm] = useState({
    alteredOrderTitle: '',
    commissionInvoiceTitle: '',
    documentFooterNote: '',
    gstApplicable: 'false',
    gstRatePercent: '',
    sacCode: '',
    invoiceNumberPrefix: '',
    legalName: '',
    gstin: '',
    addressLines: '',
    contactEmail: '',
    contactPhone: '',
    alteredOrderEmailSubject: '',
    alteredOrderEmailBody: '',
  });
  const [saving, setSaving] = useState(false);

  // Hydrate the form once settings arrive.
  useEffect(() => {
    const s = data?.data;
    if (!s) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating local edit state from fetched data, not a render-time derivation
    setForm({
      alteredOrderTitle: s.documentTitles?.alteredOrderTitle ?? '',
      commissionInvoiceTitle: s.documentTitles?.commissionInvoiceTitle ?? '',
      documentFooterNote: s.documentTitles?.documentFooterNote ?? '',
      gstApplicable: s.commissionTax?.gstApplicable ? 'true' : 'false',
      gstRatePercent:
        s.commissionTax?.gstRatePercent === undefined ? '' : String(s.commissionTax.gstRatePercent),
      sacCode: s.commissionTax?.sacCode ?? '',
      invoiceNumberPrefix: s.commissionTax?.invoiceNumberPrefix ?? '',
      legalName: s.companyIdentity?.legalName ?? '',
      gstin: s.companyIdentity?.gstin ?? '',
      addressLines: (s.companyIdentity?.addressLines ?? []).join('\n'),
      contactEmail: s.companyIdentity?.contactEmail ?? '',
      contactPhone: s.companyIdentity?.contactPhone ?? '',
      alteredOrderEmailSubject: s.alteredOrderEmailSubject ?? '',
      alteredOrderEmailBody: s.alteredOrderEmailBody ?? '',
    });
  }, [data]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    // Mirror the server rule so the user gets the message before a round trip.
    if (form.gstApplicable === 'true') {
      const rate = Number(form.gstRatePercent);
      if (!form.gstRatePercent || Number.isNaN(rate) || rate <= 0) {
        toast.error('Enter the GST rate that applies to commission');
        return;
      }
      if (!form.sacCode.trim()) {
        toast.error('A SAC code is required when GST applies');
        return;
      }
    }

    setSaving(true);
    try {
      await deskJson.patch('/api/v1/ops/settings', {
        documentTitles: {
          alteredOrderTitle: form.alteredOrderTitle || undefined,
          commissionInvoiceTitle: form.commissionInvoiceTitle || undefined,
          documentFooterNote: form.documentFooterNote || undefined,
        },
        commissionTax: {
          gstApplicable: form.gstApplicable === 'true',
          gstRatePercent: form.gstRatePercent ? Number(form.gstRatePercent) : undefined,
          sacCode: form.sacCode || undefined,
          invoiceNumberPrefix: form.invoiceNumberPrefix || undefined,
        },
        companyIdentity: {
          legalName: form.legalName || undefined,
          gstin: form.gstin || undefined,
          addressLines: form.addressLines
            ? form.addressLines.split('\n').map((l) => l.trim()).filter(Boolean)
            : undefined,
          contactEmail: form.contactEmail || '',
          contactPhone: form.contactPhone || undefined,
        },
        alteredOrderEmailSubject: form.alteredOrderEmailSubject || undefined,
        alteredOrderEmailBody: form.alteredOrderEmailBody || undefined,
      });
      toast.success('Desk settings saved');
      mutate();
    } catch (err) {
      toast.error(deskErrorMessage(err, 'Could not save settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Desk Settings' }]}>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Desk Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Titles, company identity and commission tax used on generated documents.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={saving || isLoading}>
              <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving\u2026' : 'Save'}
            </Button>
          )}
        </div>

        {!canEdit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            These settings are read-only for your role. Ask an administrator to change them.
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-gray-200">
            <EmptyState
              icon={SlidersHorizontal}
              title="Settings could not be loaded"
              description={deskErrorMessage(error, 'Please try again.')}
            />
          </div>
        ) : (
          <>
            <Section
              title="Company identity"
              description="Printed at the top of the altered order and the commission invoice. Confirm the legal name with your CA before going live."
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Legal name">
                  <Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} disabled={!canEdit} placeholder="Registered name of your company" />
                </Field>
                <Field label="GSTIN">
                  <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} disabled={!canEdit} placeholder="27ABCDE1234F1Z5" />
                </Field>
              </div>
              <Field label="Address" hint="One line per row.">
                <Textarea value={form.addressLines} onChange={(e) => set('addressLines', e.target.value)} disabled={!canEdit} className="min-h-[90px]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact email">
                  <Input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Contact phone">
                  <Input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} disabled={!canEdit} />
                </Field>
              </div>
            </Section>

            <Section
              title="Document titles"
              description="The heading each generated PDF carries, plus an optional footer note."
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Altered order title">
                  <Input value={form.alteredOrderTitle} onChange={(e) => set('alteredOrderTitle', e.target.value)} disabled={!canEdit} placeholder="Revised Purchase Order" />
                </Field>
                <Field label="Commission invoice title">
                  <Input value={form.commissionInvoiceTitle} onChange={(e) => set('commissionInvoiceTitle', e.target.value)} disabled={!canEdit} placeholder="Tax Invoice \u2013 Commission" />
                </Field>
              </div>
              <Field label="Footer note" hint="For example a declaration or a bank-detail line.">
                <Textarea value={form.documentFooterNote} onChange={(e) => set('documentFooterNote', e.target.value)} disabled={!canEdit} />
              </Field>
            </Section>

            <Section
              title="Commission tax"
              description="Applied when a commission invoice is raised. The server refuses to raise an invoice if GST is switched on without a rate and a SAC code."
            >
              <div className="grid grid-cols-3 gap-3">
                <Field label="GST applicable">
                  <Select value={form.gstApplicable} onChange={(e) => set('gstApplicable', e.target.value)} disabled={!canEdit}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </Select>
                </Field>
                <Field label="GST rate (%)">
                  <Input
                    type="number"
                    value={form.gstRatePercent}
                    onChange={(e) => set('gstRatePercent', e.target.value)}
                    disabled={!canEdit || form.gstApplicable !== 'true'}
                    placeholder="18"
                  />
                </Field>
                <Field label="SAC code">
                  <Input
                    value={form.sacCode}
                    onChange={(e) => set('sacCode', e.target.value)}
                    disabled={!canEdit || form.gstApplicable !== 'true'}
                    placeholder="996111"
                  />
                </Field>
              </div>
              <Field
                label="Invoice number prefix"
                hint="Commission invoices are numbered PREFIX/FY/00001 and the sequence never reuses a number."
              >
                <Input value={form.invoiceNumberPrefix} onChange={(e) => set('invoiceNumberPrefix', e.target.value)} disabled={!canEdit} placeholder="COM" />
              </Field>
            </Section>

            <Section
              title="Altered order email template"
              description="Used to pre-fill the draft when you email a revised order. You can still edit any draft before sending."
            >
              <Field label="Subject">
                <Input value={form.alteredOrderEmailSubject} onChange={(e) => set('alteredOrderEmailSubject', e.target.value)} disabled={!canEdit} />
              </Field>
              <Field
                label="Body"
                hint="Available placeholders: {{chainNumber}}, {{canteenName}}, {{canteenCode}}, {{manufacturerName}}, {{manufacturerCode}}, {{sourcePoNumber}}, {{alteredOrderValue}}"
              >
                <Textarea
                  value={form.alteredOrderEmailBody}
                  onChange={(e) => set('alteredOrderEmailBody', e.target.value)}
                  disabled={!canEdit}
                  className="min-h-[160px] font-mono text-xs"
                />
              </Field>
            </Section>

            {canEdit && (
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving\u2026' : 'Save Settings'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
