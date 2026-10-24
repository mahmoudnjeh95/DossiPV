'use client';

import { useActionState } from 'react';
import { resendVerificationAction } from './actions';

/** Development only (the action sets it when SMTP is not configured and NODE_ENV is not production). */
export function DevVerifyLink({ url }: { url: string | undefined }): React.JSX.Element | null {
  if (!url) return null;
  return (
    <p className="login-field-hint" data-testid="dev-verify-link">
      Mode développement (aucun SMTP configuré) : <a href={url}>ouvrir le lien de confirmation</a>.
    </p>
  );
}

/** "Renvoyer l'email de confirmation": the address is prefilled when we know it. */
export function ResendVerificationForm({ defaultEmail = '' }: { defaultEmail?: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(resendVerificationAction, undefined);

  if (state?.sent) {
    return (
      <>
        <p className="login-notice" role="status">{state.message}</p>
        <DevVerifyLink url={state.devVerifyUrl} />
      </>
    );
  }
  return (
    <form action={formAction} className="login-form">
      <label htmlFor="resend-email">
        Adresse e-mail
        <input id="resend-email" type="email" name="email" autoComplete="email" defaultValue={defaultEmail} required />
      </label>
      {state?.error && <p className="login-error" role="alert" aria-live="polite">{state.error}</p>}
      <button type="submit" className="login-submit" disabled={pending}>
        {pending ? 'Envoi en cours…' : 'Renvoyer l’email de confirmation'}
        {!pending && <span aria-hidden="true">→</span>}
      </button>
    </form>
  );
}
