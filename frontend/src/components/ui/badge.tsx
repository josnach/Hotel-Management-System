import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground', gray: 'bg-slate-100 text-slate-700',
      green: 'bg-green-100 text-green-800', red: 'bg-red-100 text-red-700', yellow: 'bg-yellow-100 text-yellow-800',
      blue: 'bg-blue-100 text-blue-800', purple: 'bg-purple-100 text-purple-800', orange: 'bg-orange-100 text-orange-800',
    },
  },
  defaultVariants: { variant: 'gray' },
});
export const Badge = ({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => <span className={cn(badgeVariants({ variant }), className)} {...p} />;

export const statusVariant = (s: string): VariantProps<typeof badgeVariants>['variant'] =>
  ({ AVAILABLE: 'green', PAID: 'green', ACTIVE: 'green', CHECKED_IN: 'green', COMPLETED: 'green', CONFIRMED: 'blue', APPROVED: 'green', VERIFIED: 'green', IN: 'green',
     OCCUPIED: 'red', UNPAID: 'yellow', VOIDED: 'red', CANCELLED: 'red', OUT: 'red', FLAGGED: 'red', OVERDUE: 'red',
     CLEANING: 'blue', MAINTENANCE: 'yellow', RESERVED: 'purple', PENDING: 'yellow', LOW: 'orange', CHECKED_OUT: 'yellow', SETTLED: 'blue',
     DRAFT: 'gray', RECEIVED: 'purple', PREPARING: 'purple', READY: 'green', SERVED: 'gray', INQUIRY: 'yellow', QUOTED: 'orange', IN_PROGRESS: 'blue' } as Record<string, VariantProps<typeof badgeVariants>['variant']>)[s] ?? 'gray';
