'use client';

import { useState, useTransition } from 'react';
import { createIntentAction } from '../../app/paiement/actions';
import type { BillingOffer } from '../../lib/payments/billing';

const money = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

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

  function pay(): void {
    if (!provider) return;
    setError('');
    startTransition(async () => {
      const result = await createIntentAction(offer.purpose, offer.planId, months, provider);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="card">
      <h3>{offer.title}</h3>
      <p className="hint">{money(offer.monthlyTnd)} par mois</p>
      {offer.note && <p className="hint">{offer.note}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label>
          Durée{' '}
          <select value={months} onChange={(event) => setMonths(Number(event.target.value))} disabled={pending}>
            {offer.options.map((o) => (
              <option key={o.months} value={o.months}>
                {o.months} mois
              </option>
            ))}
          </select>
        </label>
        {providers.length > 1 && (
          <label>
            Payer avec{' '}
            <select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={pending}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {option && (
        <p>
          <strong>Montant à payer : {money(option.amountTnd)}</strong>
        </p>
      )}
      <button type="button" onClick={pay} disabled={pending || !canPay || !provider}>
        {pending ? 'Ouverture…' : offer.buttonLabel}
      </button>
      {error && (
        <p className="banner banner-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
