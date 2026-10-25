import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2.5 rounded-ui border px-4 py-2.5 text-base leading-tight font-[650] no-underline transition duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-app-primary bg-app-primary text-white shadow-[0_1px_2px_rgba(11,31,74,0.18),0_6px_14px_-8px_rgba(11,31,74,0.5)] hover:border-[#17358a] hover:bg-[#17358a]',
        secondary:
          'border-app-border bg-app-surface text-app-text shadow-none hover:border-[#bdc9d5] hover:bg-[#eef2fa]',
        danger: 'border-app-danger bg-app-danger text-white hover:brightness-110',
        gold: 'border-[#d99a0c] bg-linear-to-b from-[#ffc43d] to-[#e8a317] text-[#1a1203] shadow-[0_1px_2px_rgba(120,80,0,0.3),0_10px_22px_-10px_rgba(232,163,23,0.9)] hover:from-[#ffcf5c] hover:to-[#eeaa1c]',
        ghost: 'border-white/40 bg-transparent text-white shadow-none hover:border-white hover:bg-white/12',
      },
      size: { default: '', sm: 'min-h-10 px-2.5 py-1 text-[0.9rem]' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
