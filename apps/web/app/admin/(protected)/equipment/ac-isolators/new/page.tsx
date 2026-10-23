'use client';

import { useActionState } from 'react';
import { AcIsolatorFields } from '../../../../../../components/equipment/ac-isolator-fields';
import { createAcIsolatorAction } from '../actions';

export default function NewAcIsolatorPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createAcIsolatorAction, undefined);

  return (
    <main>
      <h1>Ajouter un sectionneur AC</h1>
      <form action={formAction}>
        <AcIsolatorFields />
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
