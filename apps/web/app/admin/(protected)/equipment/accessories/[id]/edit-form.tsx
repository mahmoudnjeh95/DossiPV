'use client';

import { useActionState } from 'react';
import type { Accessory } from '@dossipv/db';
import { AccessoryFields } from '../../../../../../components/equipment/accessory-fields';
import { updateAccessoryAction } from '../actions';

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
        <label>
          Remplacer la fiche technique (PDF) <input type="file" name="datasheet" accept="application/pdf" />
        </label>
        <button type="submit" disabled={pending}>
          Enregistrer
        </button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
