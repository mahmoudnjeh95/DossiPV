'use client';

import { useActionState } from 'react';
import { SpdFields } from '../../../../../../components/equipment/spd-fields';
import { createSpdAction } from '../actions';

export default function NewSpdPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createSpdAction, undefined);

  return (
    <main>
      <h1>Ajouter un parafoudre</h1>
      <form action={formAction}>
        <SpdFields />
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
