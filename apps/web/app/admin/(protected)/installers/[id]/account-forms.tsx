'use client';

import { useActionState } from 'react';
import { addCompanyUserAction, assignPlanAction, resetCompanyUserPasswordAction, type InstallerActionState } from './actions';

export interface PlanOption {
  id: string;
  label: string;
}

export function AssignPlanForm({
  companyId,
  plans,
  currentPlanId,
}: {
  companyId: string;
  plans: PlanOption[];
  currentPlanId: string | null;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InstallerActionState | undefined, FormData>(
    assignPlanAction.bind(null, companyId),
    undefined,
  );

  return (
    <form action={formAction}>
      <label>
        Plan
        <select name="planId" defaultValue={currentPlanId ?? ''} required>
          <option value="" disabled>
            Choisir un plan
          </option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.label}
            </option>
          ))}
        </select>
      </label>
      {currentPlanId === null && (
        <label>
          Fin de période
          <input type="date" name="periodEnd" required />
        </label>
      )}
      <button type="submit" disabled={pending}>
        {currentPlanId === null ? "Créer l'abonnement" : 'Changer de plan'}
      </button>
      {currentPlanId !== null && <p className="hint">La fin de période et les dossiers déjà générés ce mois-ci sont conservés.</p>}
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
      <label>
        Nom complet
        <input type="text" name="fullName" required maxLength={200} />
      </label>
      <label>
        Email de connexion
        <input type="email" name="email" required maxLength={200} />
      </label>
      <label>
        Mot de passe
        <input type="text" name="password" required minLength={10} maxLength={72} autoComplete="off" />
      </label>
      <label>
        Rôle
        <select name="role" defaultValue="MEMBER">
          <option value="MEMBER">Membre</option>
          <option value="OWNER">Responsable</option>
        </select>
      </label>
      <button type="submit" disabled={pending}>
        Ajouter
      </button>
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
      <input type="text" name="password" required minLength={10} maxLength={72} autoComplete="off" placeholder="Nouveau mot de passe" aria-label="Nouveau mot de passe" />
      <button type="submit" className="secondary small" disabled={pending}>
        Réinitialiser
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
