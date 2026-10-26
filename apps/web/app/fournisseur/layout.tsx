import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireSupplier } from '../../lib/supplier-access';
import { requireCurrentTerms } from '../../lib/terms-gate';
import { BrandMark } from '../../components/brand-mark';
import { AppHeader } from '../../components/app-header';
import { logoutAction } from '../(app)/actions';
import { SubscriptionBanner } from '../../components/subscription-banner';
import { loadEffectiveSubscription } from '../../lib/sponsorship';
import { summarizeSubscription } from '../../lib/subscription';
import { Button } from '@/components/ui/button';

const NAV_LINKS = [
  { href: '/fournisseur/produits', label: 'Produits' },
  { href: '/fournisseur/installateurs', label: 'Installateurs' },
  { href: '/fournisseur/statistiques', label: 'Statistiques' },
  { href: '/fournisseur/facturation', label: 'Abonnement et paiement' },
];

/** Chrome of the supplier space; refuses anonymous visitors (/login) and installers (/dashboard). */
export default async function SupplierLayout({ children }: { children: ReactNode }): Promise<React.JSX.Element> {
  const { user, supplierName, supplierId } = await requireSupplier();
  await requireCurrentTerms(user);
  // Only a pack nearing its end, expired or suspended is announced: a supplier without a pack yet
  // is guided by its welcome card instead of the installer's « Aucun abonnement » message.
  const pack = summarizeSubscription(await loadEffectiveSubscription(supplierId), new Date());
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
      {pack && (
        // Full width under the header, like the installer app's account notices.
        <div className="[&>*]:m-0 [&>*]:rounded-none [&>*]:text-center">
          <SubscriptionBanner subscription={pack} billingHref="/fournisseur/facturation" />
        </div>
      )}
      {children}
    </>
  );
}
