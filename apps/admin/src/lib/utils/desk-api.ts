'use client';
/**
 * Work Desk client fetch helpers (Phase 30.02+).
 *
 * WHY THIS EXISTS \u2014 two real gaps in `apiFetch`:
 *
 *  1. It does not throw on a 4xx/5xx. It parses the JSON and returns it, so a
 *     caller that only uses try/catch silently treats a rejected request as a
 *     success and shows "Saved". Every Work Desk mutation matters (money,
 *     invoices, emails), so `deskFetch` throws a `DeskApiError` carrying the
 *     server's own error code and message.
 *
 *  2. It hard-codes `Content-Type: application/json`, which corrupts a multipart
 *     upload \u2014 the browser must set the boundary itself. `deskUpload` therefore
 *     issues its own request while reusing the same bearer token.
 *
 * `apiFetch` itself is deliberately left untouched: the attendance pages depend
 * on its current behaviour.
 */
import { apiFetch, getAccessToken } from '@lib/utils/api-client';

export class DeskApiError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code = 'GEN_001', status?: number) {
    super(message);
    this.name = 'DeskApiError';
    this.code = code;
    this.status = status;
  }
}

interface ApiEnvelope {
  success?: boolean;
  error?: { code?: string; message?: string };
}

/** Throws when the API envelope reports failure; otherwise returns the payload. */
function assertOk<T extends ApiEnvelope>(res: T): T {
  if (res && res.success === false) {
    throw new DeskApiError(
      res.error?.message ?? 'The request could not be completed.',
      res.error?.code ?? 'GEN_001',
    );
  }
  return res;
}

/** GET/POST/PATCH/PUT/DELETE JSON, with real error propagation. */
export async function deskFetch<T extends ApiEnvelope>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await apiFetch<T>(path, options);
  return assertOk(res);
}

/** Convenience wrappers so call sites stay short and consistent. */
export const deskJson = {
  get: <T extends ApiEnvelope>(path: string) => deskFetch<T>(path),
  post: <T extends ApiEnvelope>(path: string, body?: unknown) =>
    deskFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T extends ApiEnvelope>(path: string, body?: unknown) =>
    deskFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T extends ApiEnvelope>(path: string, body?: unknown) =>
    deskFetch<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T extends ApiEnvelope>(path: string) => deskFetch<T>(path, { method: 'DELETE' }),
};

/**
 * Multipart upload. The Content-Type header is intentionally NOT set so the
 * browser can add the multipart boundary.
 */
export async function deskUpload<T extends ApiEnvelope>(
  path: string,
  form: FormData,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: 'POST',
    body: form,
    headers,
    credentials: 'include',
  });

  let json: T;
  try {
    json = (await res.json()) as T;
  } catch {
    throw new DeskApiError(
      res.status === 413
        ? 'That file is too large to upload.'
        : `Upload failed (HTTP ${res.status}).`,
      'OPS_044',
      res.status,
    );
  }

  if (!res.ok || json?.success === false) {
    throw new DeskApiError(
      json?.error?.message ?? `Upload failed (HTTP ${res.status}).`,
      json?.error?.code ?? 'OPS_044',
      res.status,
    );
  }
  return json;
}

/** Opens a vault document in a new tab, or forces a download. */
export function deskDocumentUrl(documentId: string, download = false): string {
  return `/api/v1/ops/documents/${documentId}${download ? '?download=1' : ''}`;
}

/** Human-readable message for any thrown value. */
export function deskErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof DeskApiError) return err.message;
  if (err instanceof Error) {
    return err.message === 'SESSION_EXPIRED'
      ? 'Your session expired. Please sign in again.'
      : err.message;
  }
  return fallback;
}
