'use client';

import { useActionState } from 'react';
import { CableFields } from '../../../../../../components/equipment/cable-fields';
import { createCableAction } from '../actions';

export default function NewCablePage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createCableAction, undefined);

  return (
    <main>
      <h1>Ajouter un câble</h1>
      <form action={formAction}>
        <CableFields />
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
