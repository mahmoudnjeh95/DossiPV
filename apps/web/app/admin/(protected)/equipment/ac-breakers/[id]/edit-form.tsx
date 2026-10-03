'use client';

import { useActionState } from 'react';
import type { AcBreaker } from '@dossipv/db';
import { updateAcBreakerAction } from '../actions';

function toDateInputValue(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function EditAcBreakerForm({ acBreaker }: { acBreaker: AcBreaker }): React.JSX.Element {
  const boundAction = updateAcBreakerAction.bind(null, acBreaker.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le disjoncteur AC : {acBreaker.brand} {acBreaker.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={acBreaker.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={acBreaker.model} required />
        </label>
        <label>
          Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" defaultValue={acBreaker.ratedCurrentA} required />
        </label>
        <label>
          Courbe (optionnel) <input name="curve" defaultValue={acBreaker.curve ?? undefined} />
        </label>
        <label>
          Pouvoir de coupure (kA, optionnel){' '}
          <input type="number" name="breakingCapacityKA" step="0.01" defaultValue={acBreaker.breakingCapacityKA ?? undefined} />
        </label>
        <label>
          Référence d&apos;homologation (optionnel){' '}
          <input name="homologationReference" defaultValue={acBreaker.homologationReference ?? undefined} />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel){' '}
          <input type="date" name="homologationValidTo" defaultValue={toDateInputValue(acBreaker.homologationValidTo)} />
        </label>
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
