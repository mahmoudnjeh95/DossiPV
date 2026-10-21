'use client';

import { useActionState } from 'react';
import { updateLibraryPriceAction, type LibraryActionState } from './actions';

export function PriceForm({ libraryItemId, priceTnd }: { libraryItemId: string; priceTnd: number }): React.JSX.Element {
  const bound = updateLibraryPriceAction.bind(null, libraryItemId);
  const [state, formAction, pending] = useActionState<LibraryActionState, FormData>(bound, undefined);
  return (
    <form action={formAction}>
      <label>
        Prix d&apos;achat (DT)
        <input type="number" name="price" min={0} max={1000000} step="0.001" defaultValue={priceTnd} required />
      </label>
      <button type="submit" disabled={pending}>Enregistrer</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
