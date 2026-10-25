'use client';

import { useActionState } from 'react';
import type { Spd } from '@dossipv/db';
import { SpdFields } from '../../../../../../components/equipment/spd-fields';
import { updateSpdAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditSpdForm({ spd }: { spd: Spd }): React.JSX.Element {
  const boundAction = updateSpdAction.bind(null, spd.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le parafoudre : {spd.brand} {spd.model}
      </h1>
      <form action={formAction}>
        <SpdFields item={spd} />
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
