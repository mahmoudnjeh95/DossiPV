'use client';

import { useActionState } from 'react';
import type { PlanActionState } from './actions';

export interface PlanFormValues {
  name: string;
  tier: 'STANDARD' | 'PREMIUM';
  monthlyDossierLimit: number;
  priceTnd: number;
  isTrial: boolean;
}

export function PlanForm({
  action,
  plan,
}: {
  action: (prevState: PlanActionState | undefined, formData: FormData) => Promise<PlanActionState | undefined>;
  plan?: PlanFormValues;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="stack">
      <div className="form-grid">
        <label>
          Nom
          <input type="text" name="name" defaultValue={plan?.name} required maxLength={100} />
        </label>
        <label>
          Niveau
          <select name="tier" defaultValue={plan?.tier ?? 'STANDARD'}>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </label>
        <label>
          Dossiers par mois
          <input type="number" name="monthlyDossierLimit" defaultValue={plan?.monthlyDossierLimit} min={1} max={1000} step={1} required />
        </label>
        <label>
          Prix (TND / mois)
          <input type="number" name="priceTnd" defaultValue={plan?.priceTnd} min={0} step="0.001" required />
        </label>
      </div>
      <label>
        <input type="checkbox" name="isTrial" defaultChecked={plan?.isTrial ?? false} /> Essai gratuit
      </label>
      <p className="hint">
        La limite de dossiers vaut pour toute la durée de l&apos;essai (pas par mois). Un seul plan d&apos;essai non archivé à la fois ; les
        inscriptions ont besoin d&apos;un plan d&apos;essai actif.
      </p>
      <button type="submit" disabled={pending}>
        Enregistrer
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
