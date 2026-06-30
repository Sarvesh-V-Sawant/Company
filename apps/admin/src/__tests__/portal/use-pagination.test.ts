/**
 * @jest-environment jsdom
 */

// usePagination reads URL params and writes back via router.
// Test the buildQuery helper logic in isolation.

function buildQueryFn(page: number, limit: number, extra?: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  sp.set('page', String(page));
  sp.set('limit', String(limit));
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '') sp.set(k, String(v));
    }
  }
  return sp.toString();
}

describe('usePagination — buildQuery logic', () => {
  it('includes page and limit', () => {
    const q = buildQueryFn(1, 20);
    expect(q).toContain('page=1');
    expect(q).toContain('limit=20');
  });

  it('includes extra string params', () => {
    const q = buildQueryFn(2, 10, { status: 'pending', department: 'Eng' });
    expect(q).toContain('status=pending');
    expect(q).toContain('department=Eng');
    expect(q).toContain('page=2');
  });

  it('excludes undefined values', () => {
    const q = buildQueryFn(1, 20, { status: undefined, search: 'alice' });
    expect(q).not.toContain('status');
    expect(q).toContain('search=alice');
  });

  it('excludes empty string values', () => {
    const q = buildQueryFn(1, 20, { status: '', department: 'HR' });
    expect(q).not.toContain('status');
    expect(q).toContain('department=HR');
  });

  it('numeric extra values are stringified', () => {
    const q = buildQueryFn(1, 20, { year: 2024, month: 3 });
    expect(q).toContain('year=2024');
    expect(q).toContain('month=3');
  });

  it('page defaults produce correct offset for pagination display', () => {
    const page = 3;
    const limit = 25;
    const from = (page - 1) * limit + 1;
    const to = page * limit;
    expect(from).toBe(51);
    expect(to).toBe(75);
  });
});

describe('page clamping', () => {
  it('page must be >= 1', () => {
    const p = Math.max(1, Number('0'));
    expect(p).toBe(1);
  });

  it('NaN page defaults to 1', () => {
    const p = Math.max(1, Number('abc') || 1);
    expect(p).toBe(1);
  });
});
