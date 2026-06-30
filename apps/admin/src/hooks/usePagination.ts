'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export function usePagination(defaultLimit = 20) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const page  = Math.max(1, Number(params.get('page')  ?? 1));
  const limit = Math.max(1, Number(params.get('limit') ?? defaultLimit));

  const setPage = useCallback((p: number) => {
    const sp = new URLSearchParams(params.toString());
    sp.set('page', String(p));
    router.push(`${pathname}?${sp.toString()}`);
  }, [params, pathname, router]);

  const buildQuery = useCallback((extra?: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    sp.set('page', String(page));
    sp.set('limit', String(limit));
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== '') sp.set(k, String(v));
      }
    }
    return sp.toString();
  }, [page, limit]);

  return { page, limit, setPage, buildQuery };
}
