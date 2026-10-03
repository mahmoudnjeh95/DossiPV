'use client';

import { useActionState } from 'react';
import type { AcIsolator } from '@dossipv/db';
import { updateAcIsolatorAction } from '../actions';

function toDateInputValue(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function EditAcIsolatorForm({ acIsolator }: { acIsolator: AcIsolator }): React.JSX.Element {
  const boundAction = updateAcIsolatorAction.bind(null, acIsolator.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le sectionneur AC : {acIsolator.brand} {acIsolator.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={acIsolator.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={acIsolator.model} required />
        </label>
        <label>
          Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" defaultValue={acIsolator.ratedCurrentA} required />
        </label>
        <label>
          Référence d&apos;homologation (optionnel){' '}
          <input name="homologationReference" defaultValue={acIsolator.homologationReference ?? undefined} />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel){' '}
          <input type="date" name="homologationValidTo" defaultValue={toDateInputValue(acIsolator.homologationValidTo)} />
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
