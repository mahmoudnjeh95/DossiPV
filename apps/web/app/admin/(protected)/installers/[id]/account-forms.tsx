'use client';

import { useActionState } from 'react';
import { addCompanyUserAction, assignPlanAction, resetCompanyUserPasswordAction, updatePeriodEndAction, type InstallerActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PlanOption {
  id: string;
  label: string;
}

export function AssignPlanForm({
  companyId,
  plans,
  currentPlanId,
  onTrial = false,
}: {
  companyId: string;
  plans: PlanOption[];
  currentPlanId: string | null;
  onTrial?: boolean;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InstallerActionState | undefined, FormData>(
    assignPlanAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <Label>
        Plan
        <Select name="planId" defaultValue={currentPlanId ?? ''} required>
          <option value="" disabled>
            Choisir un plan
          </option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.label}
            </option>
          ))}
        </Select>
      </Label>
      {(currentPlanId === null || onTrial) && (
        <Label>
          Fin de période
          <Input type="date" name="periodEnd" required min={todayIso()} suppressHydrationWarning />
        </Label>
      )}
      <Button type="submit" disabled={pending}>
        {currentPlanId === null ? "Créer l'abonnement" : 'Changer de plan'}
      </Button>
      {onTrial && (
        <p className="text-[0.8rem] font-normal text-app-muted">
          Pour passer de l&apos;essai à un plan payant, la fin de période est obligatoire : l&apos;essai est remplacé par une nouvelle période qui
          commence aujourd&apos;hui (son historique reste dans le journal).
        </p>
      )}
      {currentPlanId !== null && !onTrial && <p className="text-[0.8rem] font-normal text-app-muted">La fin de période et les dossiers déjà générés ce mois-ci sont conservés.</p>}
      <p className="text-[0.8rem] font-normal text-app-muted">Les plans d&apos;essai gratuit ne se choisissent pas ici : ils sont attribués à l&apos;inscription.</p>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

/** Sets the end of the period directly. Refuses a date in the past, with the reason shown under the form. */
export function PeriodEndForm({ companyId }: { companyId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InstallerActionState | undefined, FormData>(
    updatePeriodEndAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <Label>
        Nouvelle fin de période
        <Input type="date" name="periodEnd" required min={todayIso()} suppressHydrationWarning />
      </Label>
      <Button type="submit" disabled={pending}>
        Mettre à jour
      </Button>
      <p className="text-[0.8rem] font-normal text-app-muted">Fixe la date exacte de fin et remplace la date actuelle, y compris celle calculée par un paiement avec prolongation : le dernier réglage enregistré l&apos;emporte. Une date passée est refusée.</p>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

export function AddUserForm({ companyId }: { companyId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InstallerActionState | undefined, FormData>(
    addCompanyUserAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <Label>
        Nom complet
        <Input type="text" name="fullName" required maxLength={200} />
      </Label>
      <Label>
        Email de connexion
        <Input type="email" name="email" required maxLength={200} />
      </Label>
      <Label>
        Mot de passe
        <Input type="text" name="password" required minLength={10} maxLength={72} autoComplete="off" />
      </Label>
      <Label>
        Rôle
        <Select name="role" defaultValue="MEMBER">
          <option value="MEMBER">Membre</option>
          <option value="OWNER">Responsable</option>
        </Select>
      </Label>
      <Button type="submit" disabled={pending}>
        Ajouter
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

export function ResetPasswordForm({ companyId, userId }: { companyId: string; userId: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InstallerActionState | undefined, FormData>(
    resetCompanyUserPasswordAction.bind(null, companyId, userId),
    undefined,
  );

  return (
    <form action={formAction}>
      <Input type="text" name="password" required minLength={10} maxLength={72} autoComplete="off" placeholder="Nouveau mot de passe" aria-label="Nouveau mot de passe" />
      <Button variant="secondary" size="sm" type="submit"  disabled={pending}>
        Réinitialiser
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
