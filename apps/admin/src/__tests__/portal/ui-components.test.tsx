/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Badge, badgeVariants } from '@components/ui/badge';
import StatusBadge from '@components/shared/StatusBadge';
import EmptyState from '@components/shared/EmptyState';
import { Skeleton, TableSkeleton } from '@components/ui/skeleton';

// ── Button ────────────────────────────────────────────────────────────────────
describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    render(<Button>x</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-blue-600');
  });

  it('applies destructive variant classes', () => {
    render(<Button variant="destructive">x</Button>);
    expect(screen.getByRole('button').className).toContain('bg-red-600');
  });

  it('applies outline variant classes', () => {
    render(<Button variant="outline">x</Button>);
    expect(screen.getByRole('button').className).toContain('border');
  });

  it('is disabled while loading', () => {
    render(<Button loading>x</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows spinner svg when loading', () => {
    const { container } = render(<Button loading>Submit</Button>);
    const svg = container.querySelector('svg.animate-spin');
    expect(svg).toBeInTheDocument();
  });

  it('fires onClick when not loading', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>x</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = jest.fn();
    render(<Button disabled onClick={onClick}>x</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders sm size', () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole('button').className).toContain('h-8');
  });

  it('renders icon size with no text padding', () => {
    render(<Button size="icon">x</Button>);
    expect(screen.getByRole('button').className).toContain('w-9');
  });
});

// ── Input ─────────────────────────────────────────────────────────────────────
describe('Input', () => {
  it('renders an input element', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('accepts typed values', () => {
    render(<Input defaultValue="hello" />);
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();
  });

  it('shows error border when error=true', () => {
    render(<Input error />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('border-red-500');
  });

  it('shows normal border when error=false', () => {
    render(<Input />);
    expect(screen.getByRole('textbox').className).toContain('border-gray-300');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes through native attributes', () => {
    render(<Input type="email" name="email" required />);
    const input = document.querySelector('input[type="email"]');
    expect(input).toHaveAttribute('required');
  });
});

// ── Badge ─────────────────────────────────────────────────────────────────────
describe('Badge', () => {
  it('renders text content', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies success variant', () => {
    render(<Badge variant="success">Active</Badge>);
    expect(screen.getByText('Active').className).toContain('bg-green-50');
  });

  it('applies warning variant', () => {
    render(<Badge variant="warning">Pending</Badge>);
    expect(screen.getByText('Pending').className).toContain('bg-amber-50');
  });

  it('applies danger variant', () => {
    render(<Badge variant="danger">Failed</Badge>);
    expect(screen.getByText('Failed').className).toContain('bg-red-50');
  });

  it('applies info variant', () => {
    render(<Badge variant="info">Info</Badge>);
    expect(screen.getByText('Info').className).toContain('bg-blue-50');
  });

  it('defaults to default variant', () => {
    render(<Badge>Tag</Badge>);
    expect(screen.getByText('Tag').className).toContain('bg-gray-100');
  });

  it('merges custom className', () => {
    render(<Badge className="custom-class">Tag</Badge>);
    expect(screen.getByText('Tag').className).toContain('custom-class');
  });
});

// ── StatusBadge ───────────────────────────────────────────────────────────────
describe('StatusBadge', () => {
  const cases: Array<[string, string, string]> = [
    ['present',   'Present',  'bg-green-50'],
    ['absent',    'Absent',   'bg-red-50'],
    ['pending',   'Pending',  'bg-amber-50'],
    ['approved',  'Approved', 'bg-green-50'],
    ['rejected',  'Rejected', 'bg-red-50'],
    ['cancelled', 'Cancelled','bg-gray-100'],
    ['active',    'Active',   'bg-green-50'],
    ['inactive',  'Inactive', 'bg-gray-100'],
    ['half-day',  'Half Day', 'bg-amber-50'],
    ['leave',     'Leave',    'bg-blue-50'],
    ['holiday',   'Holiday',  'bg-purple-50'],
    ['lwp',       'LWP',      'bg-gray-100'],
  ];

  test.each(cases)('status=%s shows label=%s and class=%s', (status, label, cls) => {
    render(<StatusBadge status={status} />);
    const el = screen.getByText(label);
    expect(el).toBeInTheDocument();
    expect(el.className).toContain(cls);
  });

  it('capitalises unknown statuses', () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

// ── EmptyState ────────────────────────────────────────────────────────────────
describe('EmptyState', () => {
  it('shows title and description', () => {
    render(<EmptyState title="No data" description="Nothing to show" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('renders action button when action prop given', () => {
    const fn = jest.fn();
    render(<EmptyState title="Empty" action={{ label: 'Add Item', onClick: fn }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));
    expect(fn).toHaveBeenCalled();
  });

  it('renders filtered state with clear button', () => {
    const clear = jest.fn();
    render(<EmptyState title="x" filtered onClearFilters={clear} />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(clear).toHaveBeenCalled();
  });

  it('filtered state does not show provided title', () => {
    render(<EmptyState title="My Title" filtered />);
    expect(screen.queryByText('My Title')).not.toBeInTheDocument();
  });
});

// ── Skeleton ──────────────────────────────────────────────────────────────────
describe('Skeleton', () => {
  it('renders with skeleton class', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('skeleton');
  });

  it('merges custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    expect(container.firstChild).toHaveClass('h-4', 'w-full', 'skeleton');
  });
});

describe('TableSkeleton', () => {
  it('renders correct number of rows', () => {
    const { container } = render(
      <table><TableSkeleton rows={5} cols={3} /></table>,
    );
    const rows = container.querySelectorAll('tr');
    expect(rows).toHaveLength(5);
  });

  it('renders correct number of columns per row', () => {
    const { container } = render(
      <table><TableSkeleton rows={2} cols={4} /></table>,
    );
    const firstRow = container.querySelectorAll('tr')[0];
    expect(firstRow?.querySelectorAll('td')).toHaveLength(4);
  });
});
