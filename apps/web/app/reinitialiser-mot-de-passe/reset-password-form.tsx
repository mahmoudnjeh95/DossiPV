'use client';

import { useActionState } from 'react';
import { resetPasswordAction } from './actions';

// minPasswordLength comes from the server page: importing @dossipv/auth here would pull the
// database client into the browser bundle.
export function ResetPasswordForm({ token, email, minPasswordLength }: { token: string; email: string; minPasswordLength: number }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);

  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="token" value={token} />
      <label htmlFor="email">
        Adresse e-mail
        <input id="email" type="email" name="username" value={email} autoComplete="username" readOnly />
      </label>
      <label htmlFor="password">
        Nouveau mot de passe
        <input id="password" type="password" name="password" autoComplete="new-password" minLength={minPasswordLength} required />
      </label>
      <label htmlFor="confirmation">
        Confirmation du mot de passe
        <input id="confirmation" type="password" name="confirmation" autoComplete="new-password" minLength={minPasswordLength} required />
      </label>
      <p className="login-field-hint">{minPasswordLength} caractères minimum.</p>
      {state?.error && <p className="login-error" role="alert" aria-live="polite">{state.error}</p>}
      <button type="submit" className="login-submit" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
        {!pending && <span aria-hidden="true">→</span>}
      </button>
    </form>
  );
}
