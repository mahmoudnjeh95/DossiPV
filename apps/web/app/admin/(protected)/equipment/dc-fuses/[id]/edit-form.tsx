'use client';

import { useActionState } from 'react';
import type { DcFuse } from '@dossipv/db';
import { updateDcFuseAction } from '../actions';

function toDateInputValue(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function EditDcFuseForm({ dcFuse }: { dcFuse: DcFuse }): React.JSX.Element {
  const boundAction = updateDcFuseAction.bind(null, dcFuse.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le fusible DC : {dcFuse.brand} {dcFuse.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={dcFuse.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={dcFuse.model} required />
        </label>
        <label>
          Tension nominale (V) <input type="number" name="ratedVoltageV" step="0.01" defaultValue={dcFuse.ratedVoltageV} required />
        </label>
        <label>
          Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" defaultValue={dcFuse.ratedCurrentA} required />
        </label>
        <label>
          Référence d&apos;homologation (optionnel){' '}
          <input name="homologationReference" defaultValue={dcFuse.homologationReference ?? undefined} />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel){' '}
          <input type="date" name="homologationValidTo" defaultValue={toDateInputValue(dcFuse.homologationValidTo)} />
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
