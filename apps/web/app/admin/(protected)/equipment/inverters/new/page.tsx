'use client';

import { useActionState } from 'react';
import { InverterFields } from '../../../../../../components/equipment/inverter-fields';
import { createInverterAction } from '../actions';

export default function NewInverterPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createInverterAction, undefined);

  return (
    <main>
      <h1>Ajouter un onduleur</h1>
      <form action={formAction}>
        <InverterFields />
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
