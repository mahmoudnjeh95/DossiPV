import type { ComponentProps, JSX } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, inline, ...props }: ComponentProps<'label'> & { inline?: boolean }): JSX.Element {
  return (
    <label
      className={cn(
        'flex gap-1 text-[0.9rem] font-semibold',
        inline ? 'flex-row items-center gap-2' : 'flex-col',
        className,
      )}
      {...props}
    />
  );
}
