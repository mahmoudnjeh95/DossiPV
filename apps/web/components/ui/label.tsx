import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, inline, ...props }: ComponentProps<'label'> & { inline?: boolean }) {
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
