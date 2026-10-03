'use client';

import { useActionState } from 'react';
import { createPvModuleAction } from '../actions';

export default function NewPvModulePage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createPvModuleAction, undefined);

  return (
    <main>
      <h1>Ajouter un module photovoltaïque</h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" required />
        </label>
        <label>
          Modèle <input name="model" required />
        </label>
        <label>
          Puissance Pmax (Wc) <input type="number" name="pmaxW" step="0.01" required />
        </label>
        <label>
          Tension Vmp (V) <input type="number" name="vmpV" step="0.01" required />
        </label>
        <label>
          Courant Imp (A) <input type="number" name="impA" step="0.01" required />
        </label>
        <label>
          Tension Voc (V) <input type="number" name="vocV" step="0.01" required />
        </label>
        <label>
          Courant Isc (A) <input type="number" name="iscA" step="0.01" required />
        </label>
        <label>
          Coeff. temp. Voc (%/°C) <input type="number" name="tempCoeffVocPct" step="0.001" required />
        </label>
        <label>
          Coeff. temp. Isc (%/°C) <input type="number" name="tempCoeffIscPct" step="0.001" required />
        </label>
        <label>
          Coeff. temp. Pmax (%/°C) <input type="number" name="tempCoeffPmaxPct" step="0.001" required />
        </label>
        <label>
          Coeff. temp. Vmp (%/°C, optionnel) <input type="number" name="tempCoeffVmpPct" step="0.001" />
        </label>
        <label>
          Courant inverse max Irm (A) <input type="number" name="irmA" step="0.01" required />
        </label>
        <label>
          Tension système max (V) <input type="number" name="maxSystemVoltageV" step="0.01" required />
        </label>
        <label>
          Bifacial <input type="checkbox" name="bifacial" />
        </label>
        <label>
          Gain bifacial (%, optionnel) <input type="number" name="bifacialGainPct" step="0.01" />
        </label>
        <label>
          Longueur (mm) <input type="number" name="lengthMm" step="0.1" required />
        </label>
        <label>
          Largeur (mm) <input type="number" name="widthMm" step="0.1" required />
        </label>
        <label>
          Poids (kg) <input type="number" name="weightKg" step="0.01" required />
        </label>
        <label>
          NOCT (°C, optionnel) <input type="number" name="noctC" step="0.1" />
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
