import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireSupplier } from '../../lib/supplier-access';
import { BrandMark } from '../../components/brand-mark';
import { logoutAction } from '../(app)/actions';

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
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/fournisseur" className="app-brand" aria-label="SolarixPro, espace fournisseur">
            <BrandMark compact />
          </Link>
          <nav className="app-nav" aria-label="Navigation fournisseur">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="app-user">
            <Link href="/fournisseur/profil" title="Mon profil" aria-label={`Mon profil : ${supplierName}`}>
              {supplierName} · {user.fullName}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="secondary small app-logout">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
