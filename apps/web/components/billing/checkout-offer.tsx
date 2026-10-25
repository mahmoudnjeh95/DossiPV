'use client';

import { useState, useTransition } from 'react';
import { createIntentAction } from '../../app/paiement/actions';
import type { BillingOffer } from '../../lib/payments/billing';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const money = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

/** A selectable tile: the real radio stays in the page (keyboard, screen readers) and drives the tile through `peer`. */
const tile =
  'block cursor-pointer rounded-ui border border-app-border bg-app-surface px-3 py-2.5 text-center transition hover:border-[#bdc9d5] peer-checked:border-app-primary peer-checked:bg-app-accent-soft peer-checked:shadow-[inset_0_0_0_1px_var(--color-primary)] peer-focus-visible:outline-3 peer-focus-visible:outline-[rgba(29,75,151,0.35)] peer-disabled:cursor-not-allowed peer-disabled:opacity-60';

/** One purchasable item: pick a duration and a provider, see the amount, open the payment page. */
export function CheckoutOffer({
  offer,
  providers,
  canPay,
}: {
  offer: BillingOffer;
  providers: { id: string; label: string }[];
  canPay: boolean;
}): React.JSX.Element {
  const [months, setMonths] = useState(offer.options[0]?.months ?? 1);
  const [provider, setProvider] = useState<string | undefined>(providers[0]?.id);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const option = offer.options.find((o) => o.months === months) ?? offer.options[0];
  const featured = offer.tier === 'PREMIUM' && !offer.isCurrent;

  function pay(): void {
    if (!provider) return;
    setError('');
    startTransition(async () => {
      const result = await createIntentAction(offer.purpose, offer.planId, months, provider);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card className={cn('mb-0 flex flex-col gap-4', featured && 'border-app-gold shadow-lift')}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0">{offer.title}</h3>
          {offer.isCurrent && <Badge variant="ok">Votre offre</Badge>}
          {featured && <Badge variant="warn">Recommandé</Badge>}
        </div>
        <p className="m-0 mt-1 text-[1.5rem] leading-tight font-bold">
          {money(offer.monthlyTnd)} <span className="text-[0.9rem] font-normal text-app-muted">par mois</span>
        </p>
        {offer.highlights.length > 0 && (
          <ul className="m-0 mt-2 list-none space-y-1 p-0 text-[0.9rem]">
            {offer.highlights.map((line) => (
              <li key={line}>
                <span aria-hidden="true" className="mr-2 text-app-ok">
                  ✓
                </span>
                {line}
              </li>
            ))}
          </ul>
        )}
        {offer.note && <p className="m-0 mt-2 text-[0.8rem] font-normal text-app-muted">{offer.note}</p>}
      </div>

      <fieldset className="m-0 border-0 p-0" disabled={pending}>
        <legend className="mb-2 p-0 text-[0.9rem] font-semibold">Durée</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {offer.options.map((o) => (
            <label key={o.months} className="relative block">
              <input type="radio" className="peer sr-only" name={`${offer.key}-months`} checked={months === o.months} onChange={() => setMonths(o.months)} />
              <span className={tile}>
                <span className="block font-semibold">{o.months} mois</span>
                <span className="block text-[0.8rem] font-normal text-app-muted">{money(o.amountTnd)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {providers.length > 0 && (
        <fieldset className="m-0 border-0 p-0" disabled={pending}>
          <legend className="mb-2 p-0 text-[0.9rem] font-semibold">Payer avec</legend>
          <div className="grid grid-cols-3 gap-2">
            {providers.map((p) => (
              <label key={p.id} className="relative block">
                <input type="radio" className="peer sr-only" name={`${offer.key}-provider`} checked={provider === p.id} onChange={() => setProvider(p.id)} />
                <span className={cn(tile, 'font-semibold')}>{p.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {option && (
        <div className="flex items-baseline justify-between gap-3 rounded-ui bg-app-accent-soft px-4 py-3">
          <span className="text-[0.9rem] font-semibold">Montant à payer</span>
          <strong className="text-[1.25rem]">{money(option.amountTnd)}</strong>
        </div>
      )}

      <Button type="button" variant={featured ? 'gold' : 'default'} onClick={pay} disabled={pending || !canPay || !provider} className="w-full">
        {pending ? 'Ouverture…' : offer.buttonLabel}
      </Button>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
    </Card>
  );
}
