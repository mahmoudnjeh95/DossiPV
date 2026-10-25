import type { ComponentProps, JSX } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>): JSX.Element {
  return (
    <div className="max-w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse text-[0.95rem]',
          '[&_th]:border-b [&_th]:border-app-border [&_th]:bg-[#f6f8fa] [&_th]:p-2 [&_th]:text-left [&_th]:align-top [&_th]:text-[0.85rem] [&_th]:font-semibold [&_th]:text-app-muted',
          '[&_td]:border-b [&_td]:border-app-border [&_td]:p-2 [&_td]:text-left [&_td]:align-top',
          '[&_tbody_tr]:transition-colors [&_tbody_tr]:duration-200 [&_tbody_tr:hover]:bg-[#f3f6fc]',
          className,
        )}
        {...props}
      />
    </div>
  );
}
