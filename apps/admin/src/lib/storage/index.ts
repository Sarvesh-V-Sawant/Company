/**
 * Pluggable document storage (Phase 30.05).
 *
 * Two adapters behind one interface:
 *   - LocalFsAdapter  — default. Writes under `.genesis-docs/` exactly like the
 *                       original dev behaviour, so nothing changes until you opt in.
 *   - R2Adapter       — Cloudflare R2 over the S3-compatible REST API using
 *                       AWS SigV4 signed with Node's built-in crypto. No new npm
 *                       dependency is added, so `npm install` is not required.
 *
 * Selection is by env var only — no code change to switch:
 *   STORAGE_DRIVER=local | r2      (default: local)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_BASE_URL             (optional; only for a public bucket)
 *
 * Key scheme: chains/{FY}/{chainNumber}/{docType}/{timestamp}-{filename}
 * Buckets should stay private; downloads go through the app's own authenticated
 * route, which streams via `get()` or redirects to a short-lived signed URL.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface StoredObject {
  /** Storage key, stable across adapters. */
  key: string;
  /** Byte length actually written. */
  sizeBytes: number;
}

export interface StorageAdapter {
  readonly name: 'local' | 'r2';
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  /** Returns a time-limited URL, or null when the adapter cannot sign URLs. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>;
}

export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Strips path separators and traversal so a filename can never escape its prefix. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.slice(0, 180) || 'file';
}

/** Rejects any key containing traversal segments. */
function assertSafeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\0')) {
    throw new StorageError(`Unsafe storage key: ${key}`);
  }
}

export function buildDocumentKey(params: {
  fiscalYear: string;
  chainNumber: string;
  docType: string;
  fileName: string;
}): string {
  const safeChain = params.chainNumber.replace(/[^A-Za-z0-9-]/g, '_');
  const safeType = params.docType.replace(/[^A-Za-z0-9_]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `chains/${params.fiscalYear}/${safeChain}/${safeType}/${stamp}-${sanitizeFileName(params.fileName)}`;
}

// ─── Local filesystem adapter ────────────────────────────────────────────────

const LOCAL_ROOT = path.join(process.cwd(), '.genesis-docs');

export class LocalFsAdapter implements StorageAdapter {
  readonly name = 'local' as const;

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(LOCAL_ROOT, key);
    // Defence in depth: the resolved path must stay inside LOCAL_ROOT.
    if (full !== LOCAL_ROOT && !full.startsWith(LOCAL_ROOT + path.sep)) {
      throw new StorageError(`Resolved path escapes storage root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Uint8Array): Promise<StoredObject> {
    const dest = this.resolve(key);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, body);
    } catch (err) {
      throw new StorageError('Failed to write document to local storage', err);
    }
    return { key, sizeBytes: body.byteLength };
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await fs.readFile(this.resolve(key)));
    } catch (err) {
      throw new StorageError('Document not found in local storage', err);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // Already gone is an acceptable outcome for delete.
    }
  }

  async signedUrl(): Promise<string | null> {
    return null; // Local files stream through the authenticated app route.
  }
}

// ─── Cloudflare R2 adapter (S3-compatible, SigV4, no SDK) ────────────────────

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
}

function sha256Hex(data: string | Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function encodeKeyPath(key: string): string {
  return key.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

export class R2Adapter implements StorageAdapter {
  readonly name = 'r2' as const;
  private readonly host: string;
  private readonly region = 'auto';
  private readonly service = 's3';

  constructor(private readonly cfg: R2Config) {
    this.host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  }

  private signingKey(dateStamp: string): Buffer {
    const kDate = hmac(`AWS4${this.cfg.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, this.service);
    return hmac(kService, 'aws4_request');
  }

  private async request(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<Response> {
    assertSafeKey(key);
    const canonicalUri = `/${this.cfg.bucket}/${encodeKeyPath(key)}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = body ? sha256Hex(body) : sha256Hex('');

    const headers: Record<string, string> = {
      host: this.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) headers['content-type'] = contentType;

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = crypto
      .createHmac('sha256', this.signingKey(dateStamp))
      .update(stringToSign, 'utf8')
      .digest('hex');

    headers['authorization'] =
      `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(`https://${this.host}${canonicalUri}`, {
      method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject> {
    let res: Response;
    try {
      res = await this.request('PUT', key, body, contentType);
    } catch (err) {
      throw new StorageError('R2 upload request failed', err);
    }
    if (!res.ok) {
      throw new StorageError(`R2 upload rejected with status ${res.status}`);
    }
    return { key, sizeBytes: body.byteLength };
  }

  async get(key: string): Promise<Uint8Array> {
    let res: Response;
    try {
      res = await this.request('GET', key);
    } catch (err) {
      throw new StorageError('R2 download request failed', err);
    }
    if (!res.ok) throw new StorageError(`R2 object not retrievable (status ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    try {
      await this.request('DELETE', key);
    } catch {
      // Best-effort delete; metadata soft-delete is the source of truth.
    }
  }

  /** Presigned GET via query-string SigV4. */
  async signedUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    assertSafeKey(key);
    if (this.cfg.publicBaseUrl) {
      return `${this.cfg.publicBaseUrl.replace(/\/$/, '')}/${encodeKeyPath(key)}`;
    }
    const canonicalUri = `/${this.cfg.bucket}/${encodeKeyPath(key)}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const expires = Math.min(Math.max(expiresInSeconds, 60), 604800);

    const params = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.cfg.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    });
    // URLSearchParams sorts nothing by default; SigV4 needs sorted query keys.
    const sortedQuery = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalRequest = [
      'GET',
      canonicalUri,
      sortedQuery,
      `host:${this.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = crypto
      .createHmac('sha256', this.signingKey(dateStamp))
      .update(stringToSign, 'utf8')
      .digest('hex');

    return `https://${this.host}${canonicalUri}?${sortedQuery}&X-Amz-Signature=${signature}`;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

let cached: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (cached) return cached;

  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();

  if (driver === 'r2') {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;

    // Fail loudly rather than silently writing to a local disk that Vercel wipes.
    const missing = [
      !accountId && 'R2_ACCOUNT_ID',
      !accessKeyId && 'R2_ACCESS_KEY_ID',
      !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
      !bucket && 'R2_BUCKET',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new StorageError(
        `STORAGE_DRIVER=r2 but missing env var(s): ${missing.join(', ')}`,
      );
    }

    cached = new R2Adapter({
      accountId: accountId!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      bucket: bucket!,
      publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
    });
    return cached;
  }

  cached = new LocalFsAdapter();
  return cached;
}

/** Test seam — clears the memoised adapter. */
export function resetStorageAdapter(): void {
  cached = null;
}
