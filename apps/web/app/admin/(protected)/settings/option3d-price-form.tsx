'use client';

import { useActionState } from 'react';
import { updateOption3dPriceAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Option3dPriceForm({ priceTnd }: { priceTnd: number | null }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(updateOption3dPriceAction, undefined);

  return (
    <form action={formAction}>
      <Label>
        Prix de l&apos;option 3D (TND / mois)
        <Input type="number" name="option3dPriceTnd" defaultValue={priceTnd ?? undefined} min={0} step="0.001" required />
      </Label>
      <Button type="submit" disabled={pending}>
        Enregistrer
      </Button>
      {state?.saved && <p role="status">Prix enregistré.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
