import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default:  'bg-gray-100 text-gray-700',
        success:  'bg-green-50 text-green-700',
        warning:  'bg-amber-50 text-amber-700',
        danger:   'bg-red-50 text-red-700',
        info:     'bg-blue-50 text-blue-700',
        purple:   'bg-purple-50 text-purple-700',
        orange:   'bg-orange-50 text-orange-700',
        muted:    'bg-gray-100 text-gray-500',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
