'use client';

import { useActionState } from 'react';
import { PvModuleFields } from '../../../../../../components/equipment/pv-module-fields';
import { createPvModuleAction } from '../actions';

export default function NewPvModulePage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createPvModuleAction, undefined);

  return (
    <main>
      <h1>Ajouter un module photovoltaïque</h1>
      <form action={formAction}>
        <PvModuleFields />
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
