'use client';

import { useActionState } from 'react';
import type { Cable, CableSection } from '@dossipv/db';
import { updateCableAction } from '../actions';
import { SectionsField } from '../sections-field';

function toDateInputValue(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function EditCableForm({ cable }: { cable: Cable & { sections: CableSection[] } }): React.JSX.Element {
  const boundAction = updateCableAction.bind(null, cable.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  const initialRows = cable.sections.map((section) => ({
    sectionMm2: String(section.sectionMm2),
    izA: String(section.izA),
    izReferenceMethod: section.izReferenceMethod,
  }));

  return (
    <main>
      <h1>
        Modifier le câble : {cable.brand} {cable.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={cable.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={cable.model} required />
        </label>
        <label>
          Usage
          <select name="usage" required defaultValue={cable.usage}>
            <option value="DC_SOLAR">DC solaire</option>
            <option value="AC">AC</option>
            <option value="EARTH">Terre</option>
          </select>
        </label>
        <label>
          Conducteur <input name="conductor" defaultValue={cable.conductor} required />
        </label>
        <label>
          Isolation <input name="insulation" defaultValue={cable.insulation} required />
        </label>
        <label>
          Norme (optionnel) <input name="standard" defaultValue={cable.standard ?? undefined} />
        </label>
        <SectionsField initialRows={initialRows} />
        <label>
          Référence d&apos;homologation (optionnel){' '}
          <input name="homologationReference" defaultValue={cable.homologationReference ?? undefined} />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel){' '}
          <input type="date" name="homologationValidTo" defaultValue={toDateInputValue(cable.homologationValidTo)} />
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
