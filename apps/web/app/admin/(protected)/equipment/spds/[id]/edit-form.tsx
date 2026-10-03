'use client';

import { useActionState } from 'react';
import type { Spd } from '@dossipv/db';
import { updateSpdAction } from '../actions';

function toDateInputValue(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function EditSpdForm({ spd }: { spd: Spd }): React.JSX.Element {
  const boundAction = updateSpdAction.bind(null, spd.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <main>
      <h1>
        Modifier le parafoudre : {spd.brand} {spd.model}
      </h1>
      <form action={formAction}>
        <label>
          Marque <input name="brand" defaultValue={spd.brand} required />
        </label>
        <label>
          Modèle <input name="model" defaultValue={spd.model} required />
        </label>
        <label>
          Côté
          <select name="side" required defaultValue={spd.side}>
            <option value="DC">DC</option>
            <option value="AC">AC</option>
          </select>
        </label>
        <label>
          Type <input type="number" name="type" defaultValue={spd.type} required />
        </label>
        <label>
          Nombre de pôles <input type="number" name="poles" defaultValue={spd.poles} required />
        </label>
        <label>
          Tension de service Uc (V) <input type="number" name="ucV" step="0.01" defaultValue={spd.ucV} required />
        </label>
        <label>
          Niveau de protection Up (kV) <input type="number" name="upKV" step="0.01" defaultValue={spd.upKV} required />
        </label>
        <label>
          Courant nominal In (kA) <input type="number" name="inKA" step="0.01" defaultValue={spd.inKA} required />
        </label>
        <label>
          Courant max Imax (kA) <input type="number" name="imaxKA" step="0.01" defaultValue={spd.imaxKA} required />
        </label>
        <label>
          Courant de court-circuit PV Iscpv (kA, optionnel){' '}
          <input type="number" name="iscpvKA" step="0.01" defaultValue={spd.iscpvKA ?? undefined} />
        </label>
        <label>
          Référence d&apos;homologation (optionnel) <input name="homologationReference" defaultValue={spd.homologationReference ?? undefined} />
        </label>
        <label>
          Homologation valide jusqu&apos;au (optionnel){' '}
          <input type="date" name="homologationValidTo" defaultValue={toDateInputValue(spd.homologationValidTo)} />
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
