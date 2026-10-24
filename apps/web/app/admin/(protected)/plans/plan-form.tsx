'use client';

import { useActionState, useState } from 'react';
import type { PlanActionState } from './actions';

export interface PlanFormValues {
  name: string;
  tier: 'STANDARD' | 'PREMIUM';
  monthlyDossierLimit: number;
  priceTnd: number;
  isTrial: boolean;
  audience: 'INSTALLER' | 'SUPPLIER';
  maxSponsoredInstallers: number | null;
  dossiersPerInstallerPerMonth: number;
  includesHighlight: boolean;
}

export function PlanForm({
  action,
  plan,
}: {
  action: (prevState: PlanActionState | undefined, formData: FormData) => Promise<PlanActionState | undefined>;
  plan?: PlanFormValues;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [audience, setAudience] = useState<'INSTALLER' | 'SUPPLIER'>(plan?.audience ?? 'INSTALLER');
  const isPack = audience === 'SUPPLIER';

  return (
    <form action={formAction} className="stack">
      <div className="form-grid">
        <label>
          Public
          <select name="audience" value={audience} onChange={(event) => setAudience(event.target.value as 'INSTALLER' | 'SUPPLIER')}>
            <option value="INSTALLER">Plan installateur</option>
            <option value="SUPPLIER">Pack fournisseur</option>
          </select>
        </label>
        <label>
          Nom
          <input type="text" name="name" defaultValue={plan?.name} required maxLength={100} />
        </label>
        <label>
          Prix (TND / mois)
          <input type="number" name="priceTnd" defaultValue={plan?.priceTnd} min={0} step="0.001" required />
        </label>
        {isPack ? (
          <>
            <label>
              Nombre de comptes installateurs
              <input type="number" name="maxSponsoredInstallers" defaultValue={plan?.maxSponsoredInstallers ?? undefined} min={1} max={10000} step={1} required />
            </label>
            <label>
              Dossiers par installateur et par mois
              <input type="number" name="dossiersPerInstallerPerMonth" defaultValue={plan?.dossiersPerInstallerPerMonth ?? 5} min={1} max={1000} step={1} required />
            </label>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      {isPack ? (
        <>
          <label>
            <input type="checkbox" name="includesHighlight" defaultChecked={plan?.includesHighlight ?? false} /> Mise en avant incluse
          </label>
          <p className="hint">
            Le fournisseur paie le plan Standard de chaque installateur parrainé, dans la limite du nombre de comptes, avec le quota de dossiers
            ci-dessus par installateur et par mois.
          </p>
        </>
      ) : (
        <>
          <label>
            <input type="checkbox" name="isTrial" defaultChecked={plan?.isTrial ?? false} /> Essai gratuit
          </label>
          <p className="hint">
            La limite de dossiers vaut pour toute la durée de l&apos;essai (pas par mois). Un seul plan d&apos;essai non archivé à la fois ; les
            inscriptions ont besoin d&apos;un plan d&apos;essai actif.
          </p>
        </>
      )}
      <button type="submit" disabled={pending}>
        Enregistrer
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
