import type { ComponentProps, JSX } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-block rounded-full px-2 py-0.5 text-[0.8rem] font-semibold', {
  variants: {
    variant: {
      default: 'bg-[#e9edf2] text-app-muted',
      ok: 'bg-app-ok-bg text-app-ok',
      warn: 'bg-app-warn-bg text-app-warn',
      danger: 'bg-app-danger-bg text-app-danger',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
