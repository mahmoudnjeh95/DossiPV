import type { ReactNode } from 'react';
import Link from 'next/link';
import { SolarixProLogo, Dashboard, Users, Database, Settings, Logout, Subscription, Shield } from '@dossipv/icons';
import { logoutAdminAction } from '../app/admin/(protected)/actions';

export interface AdminShellProps {
  children: ReactNode;
}

interface NavLink {
  href: string;
  label: string;
  icon: typeof Dashboard;
}

const ADMIN_NAV_LINKS: NavLink[] = [
  { href: '/admin', label: 'Tableau de bord', icon: Dashboard },
  { href: '/admin/installers', label: 'Installateurs', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: Subscription },
  { href: '/admin/equipment', label: 'Équipements', icon: Database },
  { href: '/admin/audit', label: 'Journal', icon: Shield },
  { href: '/admin/settings', label: 'Paramètres', icon: Settings },
];

export function AdminShell({ children }: AdminShellProps): React.JSX.Element {
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/admin" className="app-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SolarixProLogo size="sm" />
            SOLARIX PRO Admin
          </Link>
          <nav className="app-nav" aria-label="Navigation admin">
            {ADMIN_NAV_LINKS.map((link) => {
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
            <form action={logoutAdminAction}>
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
