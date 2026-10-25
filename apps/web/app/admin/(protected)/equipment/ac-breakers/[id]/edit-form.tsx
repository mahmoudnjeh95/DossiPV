'use client';

import { useActionState } from 'react';
import type { AcBreaker } from '@dossipv/db';
import { AcBreakerFields } from '../../../../../../components/equipment/ac-breaker-fields';
import { updateAcBreakerAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditAcBreakerForm({ acBreaker }: { acBreaker: AcBreaker }): React.JSX.Element {
  const boundAction = updateAcBreakerAction.bind(null, acBreaker.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le disjoncteur AC : {acBreaker.brand} {acBreaker.model}
      </h1>
      <form action={formAction}>
        <AcBreakerFields item={acBreaker} />
        <Label>
          Remplacer la fiche technique (PDF) <Input type="file" name="datasheet" accept="application/pdf" />
        </Label>
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
