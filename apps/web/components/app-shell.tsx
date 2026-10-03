import type { ReactNode } from 'react';
import Link from 'next/link';
import { logoutAction } from '../app/(app)/actions';

export interface AppShellProps {
  userFullName: string;
  children: ReactNode;
}

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/dashboard', label: 'Tableau de bord' },
  { href: '/projects', label: 'Projets' },
  { href: '/library', label: 'Bibliothèque' },
  { href: '/settings', label: 'Société' },
];

/**
 * Authenticated chrome shared by every installer-facing page: brand, primary navigation,
 * current user and logout. Rendered by the (app) route-group layout, so a new page under
 * (app)/ gets it for free.
 */
export function AppShell({ userFullName, children }: AppShellProps): React.JSX.Element {
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dashboard" className="app-brand">
            DossiPV
          </Link>
          <nav className="app-nav" aria-label="Navigation principale">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="app-user">
            <span>{userFullName}</span>
            <form action={logoutAction}>
              <button type="submit" className="secondary small">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
