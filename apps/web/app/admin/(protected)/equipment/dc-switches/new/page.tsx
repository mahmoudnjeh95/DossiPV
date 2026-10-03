'use client';

import { useActionState } from 'react';
import { createDcSwitchAction } from '../actions';

export default function NewDcSwitchPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createDcSwitchAction, undefined);

  return (
    <main>
      <h1>Ajouter un sectionneur DC</h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" required />
        </label>
        <label>
          Modèle <input name="model" required />
        </label>
        <label>
          Tension nominale (V) <input type="number" name="ratedVoltageV" step="0.01" required />
        </label>
        <label>
          Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" required />
        </label>
        <label>
          Nombre de pôles <input type="number" name="poles" required />
        </label>
        <label>
          Référence d&apos;homologation (optionnel) <input name="homologationReference" />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel) <input type="date" name="homologationValidTo" />
        </label>
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
