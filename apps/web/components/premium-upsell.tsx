import Link from 'next/link';
import type { PremiumUpgrade } from '../lib/payments/upgrade';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Home-page call to action for a Standard subscriber: what Premium adds, its price, one click to the checkout. */
export function PremiumUpsell({ upgrade }: { upgrade: PremiumUpgrade }): React.JSX.Element {
  const price = upgrade.monthlyTnd.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Card as="section" className="flex flex-wrap items-center justify-between gap-4 border-app-gold bg-linear-to-br from-(--color-gold-soft) to-app-surface">
      <div className="min-w-0 flex-1 basis-[280px]">
        <h2 className="m-0">Passez à {upgrade.planName}</h2>
        <ul className="m-0 mt-2 list-none space-y-1 p-0 text-[0.9rem]">
          {upgrade.highlights.map((line) => (
            <li key={line}>
              <span aria-hidden="true" className="mr-2 text-app-ok">
                ✓
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="text-[0.9rem] text-app-muted">
          dès <strong className="text-[1.4rem] text-app-text">{price} TND</strong> par mois
        </div>
        <Link href="/facturation#offres" className={buttonVariants({ variant: 'gold' })}>
          Passer à {upgrade.planName}
        </Link>
      </div>
    </Card>
  );
}
