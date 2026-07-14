export function getAppUrl(): string {
  // APP_BASE_URL: server-only (no NEXT_PUBLIC_ prefix) — read at runtime, not inlined at build.
  // Preferred for server-side email links so Vercel env changes take effect without a rebuild.
  // NEXT_PUBLIC_APP_URL: inlined at build time — only correct if set before the Vercel build ran.
  const url =
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000';
  return url.replace(/\/$/, '');
}
