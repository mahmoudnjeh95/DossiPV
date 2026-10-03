'use client';

import { useActionState } from 'react';
import { createSpdAction } from '../actions';

export default function NewSpdPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createSpdAction, undefined);

  return (
    <main>
      <h1>Ajouter un parafoudre</h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" required />
        </label>
        <label>
          Modèle <input name="model" required />
        </label>
        <label>
          Côté
          <select name="side" required defaultValue="DC">
            <option value="DC">DC</option>
            <option value="AC">AC</option>
          </select>
        </label>
        <label>
          Type <input type="number" name="type" required />
        </label>
        <label>
          Nombre de pôles <input type="number" name="poles" required />
        </label>
        <label>
          Tension de service Uc (V) <input type="number" name="ucV" step="0.01" required />
        </label>
        <label>
          Niveau de protection Up (kV) <input type="number" name="upKV" step="0.01" required />
        </label>
        <label>
          Courant nominal In (kA) <input type="number" name="inKA" step="0.01" required />
        </label>
        <label>
          Courant max Imax (kA) <input type="number" name="imaxKA" step="0.01" required />
        </label>
        <label>
          Courant de court-circuit PV Iscpv (kA, optionnel) <input type="number" name="iscpvKA" step="0.01" />
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
