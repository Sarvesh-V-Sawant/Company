import { type SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@lib/utils/cn';

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }>(
  ({ className, error, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm',
        'focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-red-500' : 'border-gray-300',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
export { Select };
