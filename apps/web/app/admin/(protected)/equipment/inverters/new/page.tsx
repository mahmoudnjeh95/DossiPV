'use client';

import { useActionState } from 'react';
import { createInverterAction } from '../actions';

export default function NewInverterPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createInverterAction, undefined);

  return (
    <main>
      <h1>Ajouter un onduleur</h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" required />
        </label>
        <label>
          Modèle <input name="model" required />
        </label>
        <label>
          Phases (1 ou 3) <input type="number" name="phases" required />
        </label>
        <label>
          Puissance AC nominale (W) <input type="number" name="pacW" step="0.01" required />
        </label>
        <label>
          Puissance apparente max (VA) <input type="number" name="sacVA" step="0.01" required />
        </label>
        <label>
          Tension DC max (V) <input type="number" name="vdcMaxV" step="0.01" required />
        </label>
        <label>
          Tension MPPT min (V) <input type="number" name="mpptMinV" step="0.01" required />
        </label>
        <label>
          Tension MPPT max (V) <input type="number" name="mpptMaxV" step="0.01" required />
        </label>
        <label>
          Tension de démarrage (V) <input type="number" name="startUpV" step="0.01" required />
        </label>
        <label>
          Nombre de MPPT <input type="number" name="mpptCount" required />
        </label>
        <label>
          Entrées par MPPT <input type="number" name="inputsPerMppt" required />
        </label>
        <label>
          Courant DC max par MPPT (A) <input type="number" name="idcMaxPerMpptA" step="0.01" required />
        </label>
        <label>
          Courant de court-circuit max par MPPT (A) <input type="number" name="iscMaxPerMpptA" step="0.01" required />
        </label>
        <label>
          Tension AC nominale (V) <input type="number" name="vacNomV" step="0.01" required />
        </label>
        <label>
          Plage de tension AC (optionnel) <input name="vacRangeV" />
        </label>
        <label>
          Courant AC max (A) <input type="number" name="iacMaxA" step="0.01" required />
        </label>
        <label>
          Sectionneur DC intégré <input type="checkbox" name="integratedDcSwitch" />
        </label>
        <label>
          Homologué STEG <input type="checkbox" name="stegApproved" />
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
