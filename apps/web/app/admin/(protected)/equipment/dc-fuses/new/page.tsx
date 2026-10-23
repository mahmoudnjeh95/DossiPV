'use client';

import { useActionState } from 'react';
import { DcFuseFields } from '../../../../../../components/equipment/dc-fuse-fields';
import { createDcFuseAction } from '../actions';

export default function NewDcFusePage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createDcFuseAction, undefined);

  return (
    <main>
      <h1>Ajouter un fusible DC</h1>
      <form action={formAction}>
        <DcFuseFields />
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
