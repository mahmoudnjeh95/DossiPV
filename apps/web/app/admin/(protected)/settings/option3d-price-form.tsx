'use client';

import { useActionState } from 'react';
import { updateOption3dPriceAction } from './actions';

export function Option3dPriceForm({ priceTnd }: { priceTnd: number | null }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(updateOption3dPriceAction, undefined);

  return (
    <form action={formAction}>
      <label>
        Prix de l&apos;option 3D (TND / mois)
        <input type="number" name="option3dPriceTnd" defaultValue={priceTnd ?? undefined} min={0} step="0.001" required />
      </label>
      <button type="submit" disabled={pending}>
        Enregistrer
      </button>
      {state?.saved && <p role="status">Prix enregistré.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
