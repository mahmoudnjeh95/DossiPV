'use client';

import { useActionState } from 'react';
import type { DcSwitch } from '@dossipv/db';
import { DcSwitchFields } from '../../../../../../components/equipment/dc-switch-fields';
import { updateDcSwitchAction } from '../actions';

export function EditDcSwitchForm({ dcSwitch }: { dcSwitch: DcSwitch }): React.JSX.Element {
  const boundAction = updateDcSwitchAction.bind(null, dcSwitch.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le sectionneur DC : {dcSwitch.brand} {dcSwitch.model}
      </h1>
      <form action={formAction}>
        <DcSwitchFields item={dcSwitch} />
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
