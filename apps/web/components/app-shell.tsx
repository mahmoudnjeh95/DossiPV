import type { ReactNode } from 'react';
import { logoutAction } from '../app/(app)/actions';
import { Dashboard, Projects, Library, Settings, Subscription, Logout } from '@dossipv/icons';
import { BrandMark } from './brand-mark';
import { AppHeader } from './app-header';
import { Button } from '@/components/ui/button';
import { JobWatcherProvider } from './job-watcher';

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
  { href: '/facturation', label: 'Abonnement et paiement', icon: Subscription },
  { href: '/settings', label: 'Paramètres', icon: Settings },
];

/**
 * Authenticated chrome shared by every installer-facing page: brand, primary navigation,
 * current user and logout, and the watcher that announces finished generations on any page.
 * Rendered by the (app) route-group layout, so a new page under (app)/ gets it for free.
 */
export function AppShell({ userFullName, children }: AppShellProps): React.JSX.Element {
  return (
    <>
      <AppHeader
        brandHref="/dashboard"
        brandLabel="SolarixPro, tableau de bord"
        brand={<BrandMark compact />}
        navLabel="Navigation principale"
        items={NAV_LINKS.map((link) => ({ href: link.href, label: link.label, icon: <link.icon size="sm" color="inherit" /> }))}
      >
        <span className="hidden max-w-[180px] truncate 2xl:inline" title={userFullName}>{userFullName}</span>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" size="sm" className="gap-1.5 text-[0.82rem] max-sm:px-2.5 max-sm:text-[0.76rem]">
            <Logout size="xs" color="inherit" />
            Se déconnecter
          </Button>
        </form>
      </AppHeader>
      <JobWatcherProvider>{children}</JobWatcherProvider>
    </>
  );
}
