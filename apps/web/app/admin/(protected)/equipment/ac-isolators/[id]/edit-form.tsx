'use client';

import { useActionState } from 'react';
import type { AcIsolator } from '@dossipv/db';
import { AcIsolatorFields } from '../../../../../../components/equipment/ac-isolator-fields';
import { updateAcIsolatorAction } from '../actions';

export function EditAcIsolatorForm({ acIsolator }: { acIsolator: AcIsolator }): React.JSX.Element {
  const boundAction = updateAcIsolatorAction.bind(null, acIsolator.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le sectionneur AC : {acIsolator.brand} {acIsolator.model}
      </h1>
      <form action={formAction}>
        <AcIsolatorFields item={acIsolator} />
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
