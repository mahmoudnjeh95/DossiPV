'use client';

import { useActionState } from 'react';
import { createSupplierAction } from '../actions';

export function NewSupplierForm({ plans }: { plans: { id: string; label: string }[] }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createSupplierAction, undefined);

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
            Nom du contact
            <input type="text" name="contactName" required maxLength={200} />
          </label>
          <label>
            Email de contact
            <input type="email" name="email" required maxLength={200} />
          </label>
          <label>
            Téléphone
            <input type="tel" name="phone" required maxLength={30} />
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Compte du responsable</legend>
        <p className="hint">Le contact est le responsable du compte fournisseur.</p>
        <div className="form-grid">
          <label>
            Email de connexion
            <input type="email" name="ownerEmail" required maxLength={200} />
          </label>
          <label>
            Mot de passe
            <input type="text" name="ownerPassword" required minLength={10} maxLength={72} autoComplete="off" />
            <span className="hint">10 caractères minimum. Communiquez-le directement au fournisseur.</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Pack (facultatif)</legend>
        <div className="form-grid">
          <label>
            Pack
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
            <span className="hint">Obligatoire si un pack est choisi.</span>
          </label>
        </div>
      </fieldset>

      <button type="submit" disabled={pending}>
        Créer le fournisseur
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
