'use client';

import { useActionState } from 'react';
import { DcSwitchFields } from '../../../../../../components/equipment/dc-switch-fields';
import { createDcSwitchAction } from '../actions';

export default function NewDcSwitchPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createDcSwitchAction, undefined);

  return (
    <main>
      <h1>Ajouter un sectionneur DC</h1>
      <form action={formAction}>
        <DcSwitchFields />
        <label>
          Fiche technique (PDF) <input type="file" name="datasheet" accept="application/pdf" />
        </label>
        <label>
          Attestation d&apos;homologation (PDF) <input type="file" name="homologationDocument" accept="application/pdf" />
        </label>
        <button type="submit" disabled={pending}>
          Enregistrer
        </button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
