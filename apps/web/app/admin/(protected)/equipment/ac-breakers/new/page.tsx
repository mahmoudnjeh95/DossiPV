'use client';

import { useActionState } from 'react';
import { AcBreakerFields } from '../../../../../../components/equipment/ac-breaker-fields';
import { createAcBreakerAction } from '../actions';

export default function NewAcBreakerPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createAcBreakerAction, undefined);

  return (
    <main>
      <h1>Ajouter un disjoncteur AC</h1>
      <form action={formAction}>
        <AcBreakerFields />
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
