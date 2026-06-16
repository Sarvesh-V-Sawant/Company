export interface PaginationParams {
  page: number;
  limit: number;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  return { page, limit };
}

export function calcSkip({ page, limit }: PaginationParams): number {
  return (page - 1) * limit;
}
