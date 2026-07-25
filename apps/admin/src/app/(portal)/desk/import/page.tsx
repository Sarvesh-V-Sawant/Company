'use client';
import { useState, useRef } from 'react';
import { Upload, Download, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '@components/layout/AdminLayout';
import { Button } from '@components/ui/button';
import { Select } from '@components/ui/select';
import { apiFetch, apiFetchBlob } from '@lib/utils/api-client';

type EntityType = 'canteen' | 'manufacturer' | 'product';
type ImportStatus = 'idle' | 'uploading' | 'previewed' | 'committing' | 'committed';

interface RowError { rowNumber: number; field: string; message: string }
interface ParsedRow { rowNumber: number; data: Record<string, unknown>; errors: RowError[] }
interface PreviewResult { batchId: string; fileName: string; totalRows: number; validRows: number; errorRows: number; rows: ParsedRow[] }

export default function ImportPage() {
  const [entity, setEntity] = useState<EntityType>('canteen');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiFetchBlob(`/api/v1/ops/import/template?entity=${entity.toUpperCase()}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${entity}-template.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Template download failed'); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('uploading');
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entityType', entity.toUpperCase());
      const res = await fetch('/api/v1/ops/import/preview', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const json = await res.json() as { success: boolean; data: PreviewResult; message?: string };
      if (!json.success) { toast.error(json.message ?? 'Preview failed'); setStatus('idle'); return; }
      setPreview(json.data);
      setStatus('previewed');
    } catch { toast.error('Upload failed'); setStatus('idle'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCommit = async () => {
    if (!preview) return;
    setStatus('committing');
    try {
      await apiFetch('/api/v1/ops/import/commit', { method: 'POST', body: JSON.stringify({ batchId: preview.batchId, action: 'commit' }) });
      toast.success(`${preview.validRows} rows imported successfully`);
      setStatus('committed');
      setPreview(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Commit failed'); setStatus('previewed'); }
  };

  const handleDiscard = async () => {
    if (!preview) return;
    try {
      await apiFetch('/api/v1/ops/import/commit', { method: 'POST', body: JSON.stringify({ batchId: preview.batchId, action: 'discard' }) });
    } catch { /* silent — batch may expire anyway */ }
    setPreview(null);
    setStatus('idle');
    toast.info('Import cancelled');
  };

  const errorRows = preview?.rows.filter(r => r.errors.length > 0) ?? [];
  const canCommit = preview && preview.errorRows === 0;

  return (
    <AdminLayout breadcrumb={[{ label: 'Work Desk', href: '/desk' }, { label: 'Bulk Import' }]}>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Bulk Excel Import</h1>
        </div>

        {/* Step 1: Select entity and download template */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Step 1 — Select entity and download template</h2>
          <div className="flex items-center gap-3">
            <Select value={entity} onChange={e => { setEntity(e.target.value as EntityType); setPreview(null); setStatus('idle'); }} className="w-48" disabled={status === 'uploading' || status === 'committing'}>
              <option value="canteen">Canteens</option>
              <option value="manufacturer">Manufacturers</option>
              <option value="product">Products</option>
            </Select>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-1.5" /> Download Template
            </Button>
          </div>
        </div>

        {/* Step 2: Upload file */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Step 2 — Upload filled template</h2>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-3">Select an Excel (.xlsx) file to preview before importing</p>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={status === 'uploading' || status === 'committing'}>
              {status === 'uploading' ? 'Parsing…' : 'Choose File'}
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Step 3 — Review and confirm</h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-700"><CheckCircle className="h-4 w-4" />{preview.validRows} valid</span>
                {preview.errorRows > 0 && <span className="flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" />{preview.errorRows} errors</span>}
              </div>
            </div>

            {!canCommit && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Fix the errors below and re-upload. Batches with errors cannot be committed.</span>
              </div>
            )}

            {errorRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-red-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Row</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Field</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.flatMap(r => r.errors.map((e, i) => (
                      <tr key={`${r.rowNumber}-${i}`} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-500">{r.rowNumber}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-700">{e.field}</td>
                        <td className="px-3 py-1.5 text-red-700">{e.message}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" onClick={handleDiscard}>Cancel / Discard</Button>
              <Button size="sm" onClick={handleCommit} disabled={!canCommit || status === 'committing'}>
                {status === 'committing' ? 'Importing…' : `Import ${preview.validRows} rows`}
              </Button>
            </div>
          </div>
        )}

        {status === 'committed' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-2" />
            <p className="font-medium text-green-900">Import complete</p>
            <Button className="mt-4" variant="outline" size="sm" onClick={() => setStatus('idle')}>Import another file</Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
