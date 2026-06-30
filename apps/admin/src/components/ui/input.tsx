import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@lib/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm transition-colors',
      'placeholder:text-gray-400',
      'focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600',
      'disabled:cursor-not-allowed disabled:opacity-50',
      error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
