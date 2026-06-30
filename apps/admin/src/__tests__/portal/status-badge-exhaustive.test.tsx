/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusBadge from '@components/shared/StatusBadge';

/**
 * Exhaustive test of all domain statuses used across attendance, leave,
 * regularization, payroll, and employee entities.
 */

describe('StatusBadge — attendance statuses', () => {
  const cases: [string, string][] = [
    ['present',        'Present'],
    ['absent',         'Absent'],
    ['half-day',       'Half Day'],
    ['leave',          'Leave'],
    ['holiday',        'Holiday'],
    ['weekend',        'Weekend'],
    ['lwp',            'LWP'],
    ['not-applicable', 'N/A'],
  ];
  test.each(cases)('%s → %s', (status, expected) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('StatusBadge — leave statuses', () => {
  const cases: [string, string][] = [
    ['pending',   'Pending'],
    ['approved',  'Approved'],
    ['rejected',  'Rejected'],
    ['cancelled', 'Cancelled'],
    ['revoked',   'Revoked'],
    ['withdrawn', 'Withdrawn'],
  ];
  test.each(cases)('%s → %s', (status, expected) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('StatusBadge — payroll statuses', () => {
  const cases: [string, string][] = [
    ['draft',      'Draft'],
    ['finalised',  'Finalised'],
  ];
  test.each(cases)('%s → %s', (status, expected) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('StatusBadge — employee statuses', () => {
  const cases: [string, string][] = [
    ['active',      'Active'],
    ['inactive',    'Inactive'],
    ['checked-in',  'Checked In'],
    ['checked-out', 'Checked Out'],
  ];
  test.each(cases)('%s → %s', (status, expected) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('StatusBadge — color mapping', () => {
  it('present → success (green)', () => {
    render(<StatusBadge status="present" />);
    expect(screen.getByText('Present').className).toContain('text-green-700');
  });
  it('absent → danger (red)', () => {
    render(<StatusBadge status="absent" />);
    expect(screen.getByText('Absent').className).toContain('text-red-700');
  });
  it('pending → warning (amber)', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('Pending').className).toContain('text-amber-700');
  });
  it('rejected → danger (red)', () => {
    render(<StatusBadge status="rejected" />);
    expect(screen.getByText('Rejected').className).toContain('text-red-700');
  });
  it('leave → info (blue)', () => {
    render(<StatusBadge status="leave" />);
    expect(screen.getByText('Leave').className).toContain('text-blue-700');
  });
  it('holiday → purple', () => {
    render(<StatusBadge status="holiday" />);
    expect(screen.getByText('Holiday').className).toContain('text-purple-700');
  });
  it('revoked → orange', () => {
    render(<StatusBadge status="revoked" />);
    expect(screen.getByText('Revoked').className).toContain('text-orange-700');
  });
  it('weekend → muted (gray)', () => {
    render(<StatusBadge status="weekend" />);
    expect(screen.getByText('Weekend').className).toContain('text-gray-500');
  });
});
