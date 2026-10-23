'use client';

import { useActionState } from 'react';
import type { AcBreaker } from '@dossipv/db';
import { AcBreakerFields } from '../../../../../../components/equipment/ac-breaker-fields';
import { updateAcBreakerAction } from '../actions';

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
