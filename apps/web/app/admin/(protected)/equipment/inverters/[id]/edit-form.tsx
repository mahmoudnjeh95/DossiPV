'use client';

import { useActionState } from 'react';
import type { Inverter } from '@dossipv/db';
import { updateInverterAction } from '../actions';

export function EditInverterForm({ inverter }: { inverter: Inverter }): React.JSX.Element {
  const boundAction = updateInverterAction.bind(null, inverter.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier l&apos;onduleur : {inverter.brand} {inverter.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={inverter.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={inverter.model} required />
        </label>
        <label>
          Phases (1 ou 3) <input type="number" name="phases" defaultValue={inverter.phases} required />
        </label>
        <label>
          Puissance AC nominale (W) <input type="number" name="pacW" step="0.01" defaultValue={inverter.pacW} required />
        </label>
        <label>
          Puissance apparente max (VA) <input type="number" name="sacVA" step="0.01" defaultValue={inverter.sacVA} required />
        </label>
        <label>
          Tension DC max (V) <input type="number" name="vdcMaxV" step="0.01" defaultValue={inverter.vdcMaxV} required />
        </label>
        <label>
          Tension MPPT min (V) <input type="number" name="mpptMinV" step="0.01" defaultValue={inverter.mpptMinV} required />
        </label>
        <label>
          Tension MPPT max (V) <input type="number" name="mpptMaxV" step="0.01" defaultValue={inverter.mpptMaxV} required />
        </label>
        <label>
          Tension de démarrage (V) <input type="number" name="startUpV" step="0.01" defaultValue={inverter.startUpV} required />
        </label>
        <label>
          Nombre de MPPT <input type="number" name="mpptCount" defaultValue={inverter.mpptCount} required />
        </label>
        <label>
          Entrées par MPPT <input type="number" name="inputsPerMppt" defaultValue={inverter.inputsPerMppt} required />
        </label>
        <label>
          Courant DC max par MPPT (A){' '}
          <input type="number" name="idcMaxPerMpptA" step="0.01" defaultValue={inverter.idcMaxPerMpptA} required />
        </label>
        <label>
          Courant de court-circuit max par MPPT (A){' '}
          <input type="number" name="iscMaxPerMpptA" step="0.01" defaultValue={inverter.iscMaxPerMpptA} required />
        </label>
        <label>
          Tension AC nominale (V) <input type="number" name="vacNomV" step="0.01" defaultValue={inverter.vacNomV} required />
        </label>
        <label>
          Plage de tension AC (optionnel) <input name="vacRangeV" defaultValue={inverter.vacRangeV ?? undefined} />
        </label>
        <label>
          Courant AC max (A) <input type="number" name="iacMaxA" step="0.01" defaultValue={inverter.iacMaxA} required />
        </label>
        <label>
          Sectionneur DC intégré <input type="checkbox" name="integratedDcSwitch" defaultChecked={inverter.integratedDcSwitch} />
        </label>
        <label>
          Homologué STEG <input type="checkbox" name="stegApproved" defaultChecked={inverter.stegApproved} />
        </label>
        <label>
          Remplacer la fiche technique (PDF) <input type="file" name="datasheet" accept="application/pdf" />
        </label>
        <button type="submit" disabled={pending}>
          Enregistrer
        </button>
        {state?.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
