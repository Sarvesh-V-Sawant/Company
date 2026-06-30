import { describe, it, expect } from '@jest/globals';
import { getLeaveYearBoundaries, dateRange, weekdayOf } from '@lib/utils/leaveUtils';

// ─── getLeaveYearBoundaries ────────────────────────────────────────────────────

describe('getLeaveYearBoundaries — January fiscal year (leaveYearStartMonth = 1)', () => {
  it('U-UTIL-01: date in June → leaveYear same calendar year', () => {
    const date = new Date(Date.UTC(2026, 5, 14)); // 2026-06-14 UTC
    const result = getLeaveYearBoundaries(date, 1);
    expect(result.leaveYear).toBe(2026);
    expect(result.start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(result.end.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('U-UTIL-02: date on Jan 1 UTC midnight — no local-time ambiguity', () => {
    const date = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01 UTC
    const result = getLeaveYearBoundaries(date, 1);
    expect(result.leaveYear).toBe(2026);
    expect(result.start.toISOString().slice(0, 10)).toBe('2026-01-01');
  });
});

describe('getLeaveYearBoundaries — April fiscal year (leaveYearStartMonth = 4)', () => {
  it('U-UTIL-03: date in June (post-April) → leaveYear same calendar year', () => {
    const date = new Date(Date.UTC(2026, 5, 14)); // 2026-06-14
    const result = getLeaveYearBoundaries(date, 4);
    expect(result.leaveYear).toBe(2026);
    expect(result.start.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(result.end.toISOString().slice(0, 10)).toBe('2027-03-31');
  });

  it('U-UTIL-04: date in March (pre-April) → leaveYear is prior calendar year', () => {
    const date = new Date(Date.UTC(2026, 2, 15)); // 2026-03-15
    const result = getLeaveYearBoundaries(date, 4);
    expect(result.leaveYear).toBe(2025);
    expect(result.start.toISOString().slice(0, 10)).toBe('2025-04-01');
    expect(result.end.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('U-UTIL-05: date on Apr 1 UTC midnight (boundary start) → leaveYear = current year', () => {
    const date = new Date(Date.UTC(2026, 3, 1)); // 2026-04-01
    const result = getLeaveYearBoundaries(date, 4);
    expect(result.leaveYear).toBe(2026);
    expect(result.start.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('U-UTIL-06: date on Mar 31 UTC midnight (last day of prior year) → leaveYear = 2025', () => {
    const date = new Date(Date.UTC(2026, 2, 31)); // 2026-03-31
    const result = getLeaveYearBoundaries(date, 4);
    expect(result.leaveYear).toBe(2025);
    expect(result.end.toISOString().slice(0, 10)).toBe('2026-03-31');
  });
});

// ─── dateRange ────────────────────────────────────────────────────────────────

describe('dateRange', () => {
  it('U-UTIL-07: single day range returns one date', () => {
    const d = new Date(Date.UTC(2026, 0, 5)); // 2026-01-05
    expect(dateRange(d, d)).toEqual(['2026-01-05']);
  });

  it('U-UTIL-08: multi-day range returns correct length', () => {
    const start = new Date(Date.UTC(2026, 0, 5)); // Monday
    const end   = new Date(Date.UTC(2026, 0, 9)); // Friday
    const result = dateRange(start, end);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('2026-01-05');
    expect(result[4]).toBe('2026-01-09');
  });
});

// ─── weekdayOf ────────────────────────────────────────────────────────────────

describe('weekdayOf', () => {
  it('U-UTIL-09: 2026-01-05 is monday', () => {
    expect(weekdayOf('2026-01-05')).toBe('monday');
  });

  it('U-UTIL-10: 2026-01-10 is saturday', () => {
    expect(weekdayOf('2026-01-10')).toBe('saturday');
  });

  it('U-UTIL-11: 2026-01-11 is sunday', () => {
    expect(weekdayOf('2026-01-11')).toBe('sunday');
  });
});
