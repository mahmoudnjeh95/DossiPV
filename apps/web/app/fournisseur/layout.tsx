import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireSupplier } from '../../lib/supplier-access';
import { BrandMark } from '../../components/brand-mark';
import { AppHeader } from '../../components/app-header';
import { logoutAction } from '../(app)/actions';
import { Button } from '@/components/ui/button';

const NAV_LINKS = [
  { href: '/fournisseur/produits', label: 'Produits' },
  { href: '/fournisseur/installateurs', label: 'Installateurs' },
  { href: '/fournisseur/statistiques', label: 'Statistiques' },
  { href: '/fournisseur/facturation', label: 'Abonnement et paiement' },
];

/** Chrome of the supplier space; refuses anonymous visitors (/login) and installers (/dashboard). */
export default async function SupplierLayout({ children }: { children: ReactNode }): Promise<React.JSX.Element> {
  const { user, supplierName } = await requireSupplier();
  return (
    <>
      <AppHeader
        brandHref="/fournisseur"
        brandLabel="SolarixPro, espace fournisseur"
        brand={<BrandMark compact />}
        navLabel="Navigation fournisseur"
        items={NAV_LINKS.map((link) => ({ href: link.href, label: link.label, icon: null }))}
      >
        <Link
          href="/fournisseur/profil"
          title="Mon profil"
          aria-label={`Mon profil : ${supplierName}`}
          className="max-w-[180px] truncate max-sm:hidden"
        >
          {supplierName} · {user.fullName}
        </Link>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" size="sm" className="text-[0.82rem]">
            Déconnexion
          </Button>
        </form>
      </AppHeader>
      {children}
    </>
  );
}
