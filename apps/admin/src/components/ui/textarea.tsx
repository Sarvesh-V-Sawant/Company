import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@lib/utils/cn';

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm',
        'placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600',
        'disabled:cursor-not-allowed disabled:opacity-50 resize-y',
        error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
export { Textarea };
