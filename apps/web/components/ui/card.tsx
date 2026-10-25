import type { ElementType, ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/utils';

export const cardClass =
  'mb-[18px] rounded-ui border border-app-border bg-app-surface p-[22px] shadow-card transition duration-300 max-sm:p-[17px]';

export function Card<T extends ElementType = 'div'>({
  as,
  className,
  ...props
}: { as?: T } & Omit<ComponentPropsWithRef<T>, 'as'>) {
  const Comp: ElementType = as ?? 'div';
  return <Comp className={cn(cardClass, className)} {...props} />;
}
