'use client';

import { useActionState } from 'react';
import type { Accessory } from '@dossipv/db';
import { AccessoryFields } from '../../../../../../components/equipment/accessory-fields';
import { updateAccessoryAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditAccessoryForm({ accessory }: { accessory: Accessory }): React.JSX.Element {
  const boundAction = updateAccessoryAction.bind(null, accessory.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier l&apos;accessoire : {accessory.brand} {accessory.model}
      </h1>
      <form action={formAction}>
        <AccessoryFields item={accessory} />
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
