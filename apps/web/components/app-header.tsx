import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { NavLinks, type NavItem } from './nav-links';

/** Sticky top bar shared by the installer and admin shells: brand, navigation, user area. */
export function AppHeader({
  brandHref,
  brandLabel,
  brand,
  navLabel,
  items,
  navBelow,
  children,
}: {
  brandHref: string;
  brandLabel: string;
  brand: ReactNode;
  navLabel: string;
  items: NavItem[];
  /** Many links: the navigation takes its own scrolling row under the brand and user area. */
  navBelow?: boolean | undefined;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <header className="sticky top-0 z-10 animate-[sx-fade_0.4s_ease_backwards] border-b border-app-border/90 bg-white/85 shadow-[0_1px_0_rgba(11,31,74,0.02),0_8px_24px_-18px_rgba(11,31,74,0.35)] backdrop-blur-md backdrop-saturate-150 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-linear-to-r after:from-app-navy after:via-app-accent after:via-45% after:to-app-gold after:opacity-90 after:content-['']">
      <div className="mx-auto flex min-h-[72px] max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5 max-sm:py-3">
        <Link
          href={brandHref}
          aria-label={brandLabel}
          className={cn('group mr-3 inline-flex items-center font-bold text-app-text no-underline transition-transform duration-200 hover:-translate-y-px max-sm:mr-auto', navBelow && 'mr-auto')}
        >
          {brand}
        </Link>
        <NavLinks items={items} label={navLabel} below={navBelow} />
        <div className="flex items-center gap-2 ml-auto text-[0.9rem] text-app-muted">{children}</div>
      </div>
    </header>
  );
}
