import type { ComponentProps, JSX } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('mb-4 animate-[sx-rise_0.45s_var(--ease-out)_backwards] rounded-ui px-4 py-3', {
  variants: {
    variant: {
      default: '',
      danger: 'bg-app-danger-bg text-app-danger',
      warn: 'bg-app-warn-bg text-app-warn',
      ok: 'bg-app-ok-bg text-app-ok',
      info: 'bg-app-accent-soft text-app-text',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>): JSX.Element {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}
