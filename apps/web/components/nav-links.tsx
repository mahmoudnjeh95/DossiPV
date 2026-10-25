'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Extra content after the label, such as a count badge. */
  trailing?: ReactNode;
  /** Only the exact path marks the link current (a section index such as /admin). */
  exact?: boolean;
}

/** Primary navigation; the link of the page being viewed is marked current. */
export function NavLinks({ items, label }: { items: NavItem[]; label: string }): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-x-1 gap-y-1 max-sm:order-3 max-sm:w-full max-sm:flex-nowrap max-sm:gap-0.5 max-sm:overflow-x-auto"
    >
      {items.map((item) => {
        const current = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-1.5 rounded-[5px] px-2 py-[9px] font-[550] text-app-muted no-underline transition-colors duration-150 hover:bg-[#eef2fa] hover:text-app-text max-sm:shrink-0 max-sm:px-[9px] max-sm:py-2 max-sm:text-[0.82rem]',
              'after:absolute after:inset-x-3 after:bottom-[3px] after:h-0.5 after:origin-left after:scale-x-0 after:rounded-sm after:bg-app-gold after:transition-transform after:duration-300 hover:after:scale-x-100',
              current && 'bg-app-accent-soft font-semibold text-app-navy after:scale-x-100',
            )}
          >
            {item.icon}
            {item.label}
            {item.trailing}
          </Link>
        );
      })}
    </nav>
  );
}
