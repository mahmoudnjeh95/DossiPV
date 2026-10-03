'use client';

import { useActionState } from 'react';
import { createAccessoryAction } from '../actions';

export default function NewAccessoryPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createAccessoryAction, undefined);

  return (
    <main>
      <h1>Ajouter un accessoire</h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" required />
        </label>
        <label>
          Modèle <input name="model" required />
        </label>
        <label>
          Type
          <select name="kind" required defaultValue="MC4_CONNECTOR">
            <option value="MC4_CONNECTOR">Connecteur MC4</option>
            <option value="DISTRIBUTION_BLOCK">Bornier de répartition</option>
            <option value="CABLE_TRAY">Chemin de câbles</option>
            <option value="DC_ENCLOSURE">Coffret DC</option>
            <option value="AC_ENCLOSURE">Coffret AC</option>
            <option value="EARTH_ROD">Piquet de terre</option>
            <option value="OTHER">Autre</option>
          </select>
        </label>
        <label>
          Spécification (optionnel) <input name="spec" />
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
