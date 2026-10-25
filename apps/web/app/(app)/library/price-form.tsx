'use client';

import { useActionState } from 'react';
import { updateLibraryPriceAction, type LibraryActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PriceForm({ libraryItemId, priceTnd }: { libraryItemId: string; priceTnd: number }): React.JSX.Element {
  const bound = updateLibraryPriceAction.bind(null, libraryItemId);
  const [state, formAction, pending] = useActionState<LibraryActionState, FormData>(bound, undefined);
  return (
    <form action={formAction}>
      <Label>
        Prix d&apos;achat (DT)
        <Input type="number" name="price" min={0} max={1000000} step="0.001" defaultValue={priceTnd} required />
      </Label>
      <Button type="submit" disabled={pending}>Enregistrer</Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
