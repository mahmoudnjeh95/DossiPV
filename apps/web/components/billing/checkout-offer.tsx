'use client';

import { useState, useTransition } from 'react';
import type { PaymentMethod } from '@dossipv/db';
import { startCheckoutAction } from '../../app/paiement/actions';
import type { BillingOffer } from '../../lib/payments/billing';

const money = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

/** One purchasable item: pick a duration and a provider, see the total, pay. */
export function CheckoutOffer({
  offer,
  providers,
  canPay,
}: {
  offer: BillingOffer;
  providers: { id: PaymentMethod; label: string }[];
  canPay: boolean;
}): React.JSX.Element {
  const [months, setMonths] = useState(offer.options[0]?.months ?? 1);
  const [provider, setProvider] = useState<PaymentMethod | undefined>(providers[0]?.id);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const option = offer.options.find((o) => o.months === months) ?? offer.options[0];

  function pay(): void {
    if (!provider) return;
    setError('');
    startTransition(async () => {
      const result = await startCheckoutAction(offer.purpose, offer.planId, months, provider);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="card">
      <h3>{offer.title}</h3>
      <p className="hint">{money(offer.monthlyHtTnd)} HT par mois</p>
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
            <select value={provider} onChange={(event) => setProvider(event.target.value as PaymentMethod)} disabled={pending}>
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
          <strong>Total à payer : {money(option.ttcTnd)} TTC</strong>
          <br />
          <span className="hint">
            {money(option.htTnd)} HT + TVA {money(option.vatTnd)} + timbre fiscal {money(option.stampTnd)}
          </span>
        </p>
      )}
      <button type="button" onClick={pay} disabled={pending || !canPay || !provider}>
        {pending ? 'Redirection vers le paiement…' : offer.buttonLabel}
      </button>
      {error && (
        <p className="banner banner-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
