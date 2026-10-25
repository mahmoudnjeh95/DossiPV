'use client';

import { useActionState } from 'react';
import type { Cable, CableSection } from '@dossipv/db';
import { CableFields } from '../../../../../../components/equipment/cable-fields';
import { updateCableAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditCableForm({ cable }: { cable: Cable & { sections: CableSection[] } }): React.JSX.Element {
  const boundAction = updateCableAction.bind(null, cable.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le câble : {cable.brand} {cable.model}
      </h1>
      <form action={formAction}>
        <CableFields item={cable} />
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
