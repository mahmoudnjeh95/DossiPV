'use client';

import { useActionState } from 'react';
import { changePasswordAction, type ChangePasswordState } from './actions';

// Mirrors @dossipv/auth (MIN_PASSWORD_LENGTH); the server action checks it anyway.
const MIN_PASSWORD_LENGTH = 10;

export function PasswordForm({ disabled }: { disabled: boolean }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, undefined);
  return (
    <form action={formAction} className="stack">
      <label>
        Mot de passe actuel
        <input type="password" name="currentPassword" autoComplete="current-password" required />
      </label>
      <label>
        Nouveau mot de passe
        <input type="password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required />
      </label>
      <label>
        Confirmation du nouveau mot de passe
        <input type="password" name="confirmation" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required />
      </label>
      <p className="hint">{MIN_PASSWORD_LENGTH} caractères minimum. Vos autres connexions en cours seront fermées.</p>
      <div className="actions">
        <button type="submit" disabled={pending || disabled}>
          {pending ? 'Enregistrement…' : 'Changer le mot de passe'}
        </button>
      </div>
      {state && 'error' in state && <p role="alert">{state.error}</p>}
      {state && 'done' in state && <div className="banner banner-ok">Mot de passe changé.</div>}
    </form>
  );
}
