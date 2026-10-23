'use client';

import { useActionState } from 'react';
import { AccessoryFields } from '../../../../../../components/equipment/accessory-fields';
import { createAccessoryAction } from '../actions';

export default function NewAccessoryPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createAccessoryAction, undefined);

  return (
    <main>
      <h1>Ajouter un accessoire</h1>
      <form action={formAction}>
        <AccessoryFields />
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
