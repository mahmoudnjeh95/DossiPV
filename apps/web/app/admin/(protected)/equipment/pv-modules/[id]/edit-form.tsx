'use client';

import { useActionState } from 'react';
import type { PvModule } from '@dossipv/db';
import { updatePvModuleAction } from '../actions';

export function EditPvModuleForm({ pvModule }: { pvModule: PvModule }): React.JSX.Element {
  const boundAction = updatePvModuleAction.bind(null, pvModule.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le module : {pvModule.brand} {pvModule.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={pvModule.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={pvModule.model} required />
        </label>
        <label>
          Puissance Pmax (Wc) <input type="number" name="pmaxW" step="0.01" defaultValue={pvModule.pmaxW} required />
        </label>
        <label>
          Tension Vmp (V) <input type="number" name="vmpV" step="0.01" defaultValue={pvModule.vmpV} required />
        </label>
        <label>
          Courant Imp (A) <input type="number" name="impA" step="0.01" defaultValue={pvModule.impA} required />
        </label>
        <label>
          Tension Voc (V) <input type="number" name="vocV" step="0.01" defaultValue={pvModule.vocV} required />
        </label>
        <label>
          Courant Isc (A) <input type="number" name="iscA" step="0.01" defaultValue={pvModule.iscA} required />
        </label>
        <label>
          Coeff. temp. Voc (%/°C){' '}
          <input type="number" name="tempCoeffVocPct" step="0.001" defaultValue={pvModule.tempCoeffVocPct} required />
        </label>
        <label>
          Coeff. temp. Isc (%/°C){' '}
          <input type="number" name="tempCoeffIscPct" step="0.001" defaultValue={pvModule.tempCoeffIscPct} required />
        </label>
        <label>
          Coeff. temp. Pmax (%/°C){' '}
          <input type="number" name="tempCoeffPmaxPct" step="0.001" defaultValue={pvModule.tempCoeffPmaxPct} required />
        </label>
        <label>
          Coeff. temp. Vmp (%/°C, optionnel){' '}
          <input type="number" name="tempCoeffVmpPct" step="0.001" defaultValue={pvModule.tempCoeffVmpPct ?? undefined} />
        </label>
        <label>
          Courant inverse max Irm (A) <input type="number" name="irmA" step="0.01" defaultValue={pvModule.irmA} required />
        </label>
        <label>
          Tension système max (V){' '}
          <input type="number" name="maxSystemVoltageV" step="0.01" defaultValue={pvModule.maxSystemVoltageV} required />
        </label>
        <label>
          Bifacial <input type="checkbox" name="bifacial" defaultChecked={pvModule.bifacial} />
        </label>
        <label>
          Gain bifacial (%, optionnel){' '}
          <input type="number" name="bifacialGainPct" step="0.01" defaultValue={pvModule.bifacialGainPct ?? undefined} />
        </label>
        <label>
          Longueur (mm) <input type="number" name="lengthMm" step="0.1" defaultValue={pvModule.lengthMm} required />
        </label>
        <label>
          Largeur (mm) <input type="number" name="widthMm" step="0.1" defaultValue={pvModule.widthMm} required />
        </label>
        <label>
          Poids (kg) <input type="number" name="weightKg" step="0.01" defaultValue={pvModule.weightKg} required />
        </label>
        <label>
          NOCT (°C, optionnel) <input type="number" name="noctC" step="0.1" defaultValue={pvModule.noctC ?? undefined} />
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
