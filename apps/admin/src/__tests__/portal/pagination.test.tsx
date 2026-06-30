/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Pagination from '@components/shared/Pagination';

describe('Pagination', () => {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    total: 100,
    limit: 20,
    onPageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders page count info', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText('Showing 1–20 of 100')).toBeInTheDocument();
  });

  it('shows correct range for page 2', () => {
    render(<Pagination {...defaultProps} page={2} />);
    expect(screen.getByText('Showing 21–40 of 100')).toBeInTheDocument();
  });

  it('shows correct range for last page (partial)', () => {
    render(<Pagination {...defaultProps} page={5} total={92} />);
    expect(screen.getByText('Showing 81–92 of 92')).toBeInTheDocument();
  });

  it('shows 0–0 when total is 0', () => {
    render(<Pagination {...defaultProps} page={1} total={0} totalPages={0} />);
    expect(screen.getByText('Showing 0–0 of 0')).toBeInTheDocument();
  });

  it('disables prev button on first page', () => {
    render(<Pagination {...defaultProps} page={1} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<Pagination {...defaultProps} page={5} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it('calls onPageChange with page-1 when prev clicked', () => {
    render(<Pagination {...defaultProps} page={3} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with page+1 when next clicked', () => {
    render(<Pagination {...defaultProps} page={3} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange with correct page when page number clicked', () => {
    render(<Pagination {...defaultProps} page={1} totalPages={3} />);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(2);
  });

  it('highlights current page button', () => {
    render(<Pagination {...defaultProps} page={2} totalPages={3} />);
    const btn2 = screen.getByRole('button', { name: '2' });
    expect(btn2.className).toContain('bg-blue-600');
  });

  it('shows all pages when totalPages <= 7', () => {
    render(<Pagination {...defaultProps} page={1} totalPages={4} total={80} />);
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
  });
});
