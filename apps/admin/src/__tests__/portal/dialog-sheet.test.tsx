/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Dialog, ConfirmDialog } from '@components/ui/dialog';
import { Sheet } from '@components/ui/sheet';

// ── Dialog ────────────────────────────────────────────────────────────────────
describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(<Dialog open={false} onClose={jest.fn()} title="Test"><p>body</p></Dialog>);
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('renders title and children when open', () => {
    render(<Dialog open onClose={jest.fn()} title="My Dialog"><p>Content here</p></Dialog>);
    expect(screen.getByText('My Dialog')).toBeInTheDocument();
    expect(screen.getByText('Content here')).toBeInTheDocument();
  });

  it('calls onClose when X button clicked', () => {
    const onClose = jest.fn();
    render(<Dialog open onClose={onClose} title="T"><p>x</p></Dialog>);
    fireEvent.click(screen.getByLabelText ? document.querySelector('button[aria-label]') ?? screen.getAllByRole('button')[0] : screen.getAllByRole('button')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = jest.fn();
    render(<Dialog open onClose={onClose} title="T"><p>x</p></Dialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = jest.fn();
    const { container } = render(<Dialog open onClose={onClose} title="T"><p>x</p></Dialog>);
    const backdrop = container.querySelector('.absolute.inset-0.bg-black\\/50') as HTMLElement;
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders footer when provided', () => {
    render(
      <Dialog open onClose={jest.fn()} title="T" footer={<button>OK</button>}>
        <p>x</p>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('renders title and description', () => {
    render(
      <ConfirmDialog
        open title="Delete?" description="Are you sure?"
        onClose={jest.fn()} onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmDialog
        open title="T" description="D" confirmLabel="Yes"
        onClose={jest.fn()} onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when Cancel clicked', () => {
    const onClose = jest.fn();
    render(
      <ConfirmDialog
        open title="T" description="D"
        onClose={onClose} onConfirm={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('uses destructive variant when destructive=true', () => {
    render(
      <ConfirmDialog
        open title="T" description="D" destructive confirmLabel="Delete"
        onClose={jest.fn()} onConfirm={jest.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-red-600');
  });

  it('disables buttons when loading', () => {
    render(
      <ConfirmDialog
        open title="T" description="D" loading
        onClose={jest.fn()} onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});

// ── Sheet ─────────────────────────────────────────────────────────────────────
describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={jest.fn()} title="T"><p>body</p></Sheet>);
    expect(screen.queryByText('T')).not.toBeInTheDocument();
  });

  it('renders title and children when open', () => {
    render(<Sheet open onClose={jest.fn()} title="My Sheet"><p>Inner</p></Sheet>);
    expect(screen.getByText('My Sheet')).toBeInTheDocument();
    expect(screen.getByText('Inner')).toBeInTheDocument();
  });

  it('calls onClose on Escape key', () => {
    const onClose = jest.fn();
    render(<Sheet open onClose={onClose} title="T"><p>x</p></Sheet>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = jest.fn();
    const { container } = render(<Sheet open onClose={onClose} title="T"><p>x</p></Sheet>);
    const backdrop = container.querySelector('.absolute.inset-0') as HTMLElement;
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders footer when provided', () => {
    render(
      <Sheet open onClose={jest.fn()} title="T" footer={<button>Save</button>}>
        <p>x</p>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies sm size class', () => {
    const { container } = render(<Sheet open onClose={jest.fn()} title="T" size="sm"><p>x</p></Sheet>);
    const panel = container.querySelector('.w-\\[400px\\]');
    expect(panel).toBeInTheDocument();
  });

  it('applies lg size class', () => {
    const { container } = render(<Sheet open onClose={jest.fn()} title="T" size="lg"><p>x</p></Sheet>);
    const panel = container.querySelector('.w-\\[640px\\]');
    expect(panel).toBeInTheDocument();
  });
});
