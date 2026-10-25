'use client';

import { useActionState, useState } from 'react';
import type { PlanActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
        <Label>
          Public
          <Select name="audience" value={audience} onChange={(event) => setAudience(event.target.value as 'INSTALLER' | 'SUPPLIER')}>
            <option value="INSTALLER">Plan installateur</option>
            <option value="SUPPLIER">Pack fournisseur</option>
          </Select>
        </Label>
        <Label>
          Nom
          <Input type="text" name="name" defaultValue={plan?.name} required maxLength={100} />
        </Label>
        <Label>
          Prix (TND / mois)
          <Input type="number" name="priceTnd" defaultValue={plan?.priceTnd} min={0} step="0.001" required />
        </Label>
        {isPack ? (
          <>
            <Label>
              Nombre de comptes installateurs
              <Input type="number" name="maxSponsoredInstallers" defaultValue={plan?.maxSponsoredInstallers ?? undefined} min={1} max={10000} step={1} required />
            </Label>
            <Label>
              Dossiers par installateur et par mois
              <Input type="number" name="dossiersPerInstallerPerMonth" defaultValue={plan?.dossiersPerInstallerPerMonth ?? 5} min={1} max={1000} step={1} required />
            </Label>
          </>
        ) : (
          <>
            <Label>
              Niveau
              <Select name="tier" defaultValue={plan?.tier ?? 'STANDARD'}>
                <option value="STANDARD">Standard</option>
                <option value="PREMIUM">Premium</option>
              </Select>
            </Label>
            <Label>
              Dossiers par mois
              <Input type="number" name="monthlyDossierLimit" defaultValue={plan?.monthlyDossierLimit} min={1} max={1000} step={1} required />
            </Label>
          </>
        )}
      </div>
      {isPack ? (
        <>
          <Label>
            <Input type="checkbox" name="includesHighlight" defaultChecked={plan?.includesHighlight ?? false} /> Mise en avant incluse
          </Label>
          <p className="text-[0.8rem] font-normal text-app-muted">
            Le fournisseur paie le plan Standard de chaque installateur parrainé, dans la limite du nombre de comptes, avec le quota de dossiers
            ci-dessus par installateur et par mois.
          </p>
        </>
      ) : (
        <>
          <Label>
            <Input type="checkbox" name="isTrial" defaultChecked={plan?.isTrial ?? false} /> Essai gratuit
          </Label>
          <p className="text-[0.8rem] font-normal text-app-muted">
            La limite de dossiers vaut pour toute la durée de l&apos;essai (pas par mois). Un seul plan d&apos;essai non archivé à la fois ; les
            inscriptions ont besoin d&apos;un plan d&apos;essai actif.
          </p>
        </>
      )}
      <Button type="submit" disabled={pending}>
        Enregistrer
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
