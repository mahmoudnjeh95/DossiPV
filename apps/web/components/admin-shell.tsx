import type { ReactNode } from 'react';
import { Dashboard, Users, Database, Settings, Logout, Subscription, Shield } from '@dossipv/icons';
import { BrandMark } from './brand-mark';
import { AppHeader } from './app-header';
import { logoutAdminAction } from '../app/admin/(protected)/actions';
import { countSignupsToContact } from '../lib/admin-signups';
import { countPaymentsNeedingAttention } from '../lib/payments/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  { href: '/admin/fournisseurs', label: 'Fournisseurs', icon: Users },
  { href: '/admin/inscriptions', label: 'Inscriptions', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: Subscription },
  { href: '/admin/paiements', label: 'Paiements', icon: Subscription },
  { href: '/admin/equipment', label: 'Équipements', icon: Database },
  { href: '/admin/audit', label: 'Journal', icon: Shield },
  { href: '/admin/settings', label: 'Paramètres', icon: Settings },
];

export async function AdminShell({ children }: AdminShellProps): Promise<React.JSX.Element> {
  // A failing count must not take the whole admin down: the badge is just left out.
  const signupsToContact = await countSignupsToContact().catch(() => 0);
  const paymentsToCheck = await countPaymentsNeedingAttention().catch(() => 0);
  return (
    <>
      <AppHeader
        brandHref="/admin"
        brandLabel="SolarixPro, administration"
        brand={
          <>
            <BrandMark compact />
            <Badge variant="ok" className="ml-2.5 text-[0.68rem] tracking-[0.04em] uppercase">Admin</Badge>
          </>
        }
        navLabel="Navigation admin"
        navBelow
        items={ADMIN_NAV_LINKS.map((link) => ({
          href: link.href,
          label: link.label,
          icon: <link.icon size="sm" color="inherit" />,
          exact: link.href === '/admin',
          trailing:
            link.href === '/admin/inscriptions' && signupsToContact > 0 ? (
              <Badge variant="warn">{signupsToContact}</Badge>
            ) : link.href === '/admin/paiements' && paymentsToCheck > 0 ? (
              <Badge variant="warn">{paymentsToCheck}</Badge>
            ) : undefined,
        }))}
      >
        <form action={logoutAdminAction}>
          <Button variant="secondary" size="sm" type="submit" className="gap-1.5 text-[0.82rem]">
            <Logout size="xs" color="inherit" />
            <span className="max-sm:sr-only">Se déconnecter</span>
          </Button>
        </form>
      </AppHeader>
      {children}
    </>
  );
}
