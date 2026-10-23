'use client';

import { useActionState } from 'react';
import type { Spd } from '@dossipv/db';
import { SpdFields } from '../../../../../../components/equipment/spd-fields';
import { updateSpdAction } from '../actions';

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
