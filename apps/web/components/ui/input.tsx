import type { ComponentProps, JSX } from 'react';
import { cn } from '@/lib/utils';

export const fieldClass =
  'min-h-11 w-full min-w-0 rounded-ui border border-app-border bg-app-surface px-3 py-2.5 font-[inherit] text-app-text transition duration-150 focus:border-app-accent focus:outline-[3px] focus:outline-offset-1 focus:outline-app-accent/20 focus:shadow-[0_0_0_4px_rgba(29,75,151,0.14)] disabled:bg-[#eef1f4]';

const toggleClass = 'min-h-0 w-auto accent-app-accent';

export function Input({ className, type, ...props }: ComponentProps<'input'>): JSX.Element {
  if (type === 'hidden') return <input type="hidden" {...props} />;
  const toggle = type === 'checkbox' || type === 'radio';
  return <input type={type} className={cn(toggle ? toggleClass : fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>): JSX.Element {
  return <select className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>): JSX.Element {
  return <textarea className={cn(fieldClass, className)} {...props} />;
}
