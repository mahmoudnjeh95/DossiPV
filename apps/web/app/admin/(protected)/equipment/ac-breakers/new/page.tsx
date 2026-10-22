'use client';

import { useActionState } from 'react';
import { RCD_TYPE_OPTIONS } from '../../../../../../lib/labels';
import { createAcBreakerAction } from '../actions';

export default function NewAcBreakerPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createAcBreakerAction, undefined);

  return (
    <main>
      <h1>Ajouter un disjoncteur AC</h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" required />
        </label>
        <label>
          Modèle <input name="model" required />
        </label>
        <label>
          Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" required />
        </label>
        <label>
          Courbe (optionnel) <input name="curve" />
        </label>
        <label>
          Pouvoir de coupure (kA, optionnel) <input type="number" name="breakingCapacityKA" step="0.01" />
        </label>
        <label>
          Sensibilité différentielle IΔn (mA, vide pour un disjoncteur sans différentiel){' '}
          <input type="number" name="residualCurrentMA" step="1" min="1" />
        </label>
        <label>
          Type de différentiel{' '}
          <select name="rcdType" defaultValue="">
            <option value="">— Sans différentiel —</option>
            {RCD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
