'use client';

import { useActionState } from 'react';
import { createInstallerAction } from '../actions';

export function NewInstallerForm({ plans }: { plans: { id: string; label: string }[] }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createInstallerAction, undefined);

  return (
    <form action={formAction} className="stack">
      <fieldset className="card">
        <legend>Société</legend>
        <div className="form-grid">
          <label>
            Raison sociale
            <input type="text" name="name" required maxLength={200} />
          </label>
          <label>
            Adresse
            <input type="text" name="address" required maxLength={300} />
          </label>
          <label>
            Téléphone
            <input type="tel" name="phone" required maxLength={30} />
          </label>
          <label>
            Email de contact
            <input type="email" name="email" required maxLength={200} />
          </label>
          <label>
            Représentant légal
            <input type="text" name="legalRepFullName" required maxLength={200} />
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Accréditation ANME</legend>
        <div className="form-grid">
          <label>
            Code ANME
            <input type="text" name="anmeCode" required maxLength={50} />
          </label>
          <label>
            Catégorie
            <select name="anmeCategory" defaultValue="BT">
              <option value="BT">BT</option>
              <option value="MT">MT</option>
              <option value="BT_MT">BT + MT</option>
            </select>
          </label>
          <label>
            Valide du
            <input type="date" name="anmeValidFrom" required />
          </label>
          <label>
            Valide jusqu&apos;au
            <input type="date" name="anmeValidTo" required />
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Compte du responsable</legend>
        <div className="form-grid">
          <label>
            Nom complet
            <input type="text" name="ownerFullName" required maxLength={200} />
          </label>
          <label>
            Email de connexion
            <input type="email" name="ownerEmail" required maxLength={200} />
          </label>
          <label>
            Mot de passe
            <input type="text" name="ownerPassword" required minLength={10} maxLength={72} autoComplete="off" />
            <span className="hint">10 caractères minimum. Communiquez-le directement à l&apos;installateur.</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Abonnement (facultatif)</legend>
        <div className="form-grid">
          <label>
            Plan
            <select name="planId" defaultValue="">
              <option value="">Aucun pour l&apos;instant</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fin de période
            <input type="date" name="periodEnd" />
            <span className="hint">Obligatoire si un plan est choisi.</span>
          </label>
        </div>
      </fieldset>

      <button type="submit" disabled={pending}>
        Créer l&apos;installateur
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
