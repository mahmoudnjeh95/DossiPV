'use client';

import { useActionState } from 'react';
import { createCableAction } from '../actions';
import { SectionsField } from '../sections-field';

export default function NewCablePage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createCableAction, undefined);

  return (
    <main>
      <h1>Ajouter un câble</h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" required />
        </label>
        <label>
          Modèle <input name="model" required />
        </label>
        <label>
          Usage
          <select name="usage" required defaultValue="DC_SOLAR">
            <option value="DC_SOLAR">DC solaire</option>
            <option value="AC">AC</option>
            <option value="EARTH">Terre</option>
          </select>
        </label>
        <label>
          Conducteur <input name="conductor" required />
        </label>
        <label>
          Isolation <input name="insulation" required />
        </label>
        <label>
          Norme (optionnel) <input name="standard" />
        </label>
        <SectionsField />
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
