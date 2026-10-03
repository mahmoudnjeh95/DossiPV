'use client';

import { useActionState } from 'react';
import type { Accessory } from '@dossipv/db';
import { updateAccessoryAction } from '../actions';

function toDateInputValue(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function EditAccessoryForm({ accessory }: { accessory: Accessory }): React.JSX.Element {
  const boundAction = updateAccessoryAction.bind(null, accessory.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier l&apos;accessoire : {accessory.brand} {accessory.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={accessory.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={accessory.model} required />
        </label>
        <label>
          Type
          <select name="kind" required defaultValue={accessory.kind}>
            <option value="MC4_CONNECTOR">Connecteur MC4</option>
            <option value="DISTRIBUTION_BLOCK">Bornier de répartition</option>
            <option value="CABLE_TRAY">Chemin de câbles</option>
            <option value="DC_ENCLOSURE">Coffret DC</option>
            <option value="AC_ENCLOSURE">Coffret AC</option>
            <option value="EARTH_ROD">Piquet de terre</option>
            <option value="OTHER">Autre</option>
          </select>
        </label>
        <label>
          Spécification (optionnel) <input name="spec" defaultValue={accessory.spec ?? undefined} />
        </label>
        <label>
          Référence d&apos;homologation (optionnel){' '}
          <input name="homologationReference" defaultValue={accessory.homologationReference ?? undefined} />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel){' '}
          <input type="date" name="homologationValidTo" defaultValue={toDateInputValue(accessory.homologationValidTo)} />
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
