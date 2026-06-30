'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@components/ui/button';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
}

export default function Pagination({ page, totalPages, total, limit, onPageChange }: Props) {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
      <p className="text-sm text-gray-500">
        Showing {total === 0 ? 0 : from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const p = totalPages <= 7 ? i + 1 : i + Math.max(1, Math.min(page - 3, totalPages - 6));
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          );
        })}
        <Button variant="outline" size="icon" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
