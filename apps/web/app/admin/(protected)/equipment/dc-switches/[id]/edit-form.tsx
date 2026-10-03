'use client';

import { useActionState } from 'react';
import type { DcSwitch } from '@dossipv/db';
import { updateDcSwitchAction } from '../actions';

function toDateInputValue(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function EditDcSwitchForm({ dcSwitch }: { dcSwitch: DcSwitch }): React.JSX.Element {
  const boundAction = updateDcSwitchAction.bind(null, dcSwitch.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le sectionneur DC : {dcSwitch.brand} {dcSwitch.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={dcSwitch.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={dcSwitch.model} required />
        </label>
        <label>
          Tension nominale (V) <input type="number" name="ratedVoltageV" step="0.01" defaultValue={dcSwitch.ratedVoltageV} required />
        </label>
        <label>
          Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" defaultValue={dcSwitch.ratedCurrentA} required />
        </label>
        <label>
          Nombre de pôles <input type="number" name="poles" defaultValue={dcSwitch.poles} required />
        </label>
        <label>
          Référence d&apos;homologation (optionnel){' '}
          <input name="homologationReference" defaultValue={dcSwitch.homologationReference ?? undefined} />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel){' '}
          <input type="date" name="homologationValidTo" defaultValue={toDateInputValue(dcSwitch.homologationValidTo)} />
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
