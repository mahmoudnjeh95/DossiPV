import type { ReactNode } from 'react';
import Link from 'next/link';
import { logoutAction } from '../app/(app)/actions';
import { SolarixProLogo, Dashboard, Projects, Library, Settings, Logout } from '@dossipv/icons';

export interface AppShellProps {
  userFullName: string;
  children: ReactNode;
}

interface NavLink {
  href: string;
  label: string;
  icon: typeof Dashboard;
}

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: Dashboard },
  { href: '/projects', label: 'Projets', icon: Projects },
  { href: '/library', label: 'Bibliothèque', icon: Library },
  { href: '/settings', label: 'Société', icon: Settings },
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
          <Link href="/dashboard" className="app-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SolarixProLogo size="sm" />
            SOLARIX PRO
          </Link>
          <nav className="app-nav" aria-label="Navigation principale">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon size="sm" color="inherit" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="app-user">
            <span>{userFullName}</span>
            <form action={logoutAction}>
              <button type="submit" className="secondary small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Logout size="xs" color="inherit" />
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
