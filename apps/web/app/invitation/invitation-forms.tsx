'use client';

import { useActionState } from 'react';
import { acceptInvitationAction, createAccountFromInvitationAction, type InvitationActionState } from './actions';

// Password rules mirror @dossipv/auth (MIN_PASSWORD_LENGTH); the server action checks them anyway.
const MIN_PASSWORD_LENGTH = 10;

export function AcceptForm({ token }: { token: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InvitationActionState>(acceptInvitationAction.bind(null, token), undefined);
  return (
    <form action={formAction} className="login-form">
      {state?.error && <p className="login-error" role="alert" aria-live="polite">{state.error}</p>}
      <button type="submit" className="login-submit" disabled={pending}>
        {pending ? 'Un instant…' : 'Accepter'}
        {!pending && <span aria-hidden="true">→</span>}
      </button>
    </form>
  );
}

export function CreateAccountForm({ token, email }: { token: string; email: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<InvitationActionState, FormData>(
    createAccountFromInvitationAction.bind(null, token),
    undefined,
  );
  return (
    <form action={formAction} className="login-form">
      <label htmlFor="companyName">
        Raison sociale
        <input id="companyName" name="companyName" autoComplete="organization" maxLength={200} required />
      </label>
      <label htmlFor="contactName">
        Nom et prénom du contact
        <input id="contactName" name="contactName" autoComplete="name" maxLength={200} required />
      </label>
      <label htmlFor="phone">
        Téléphone
        <input id="phone" type="tel" name="phone" autoComplete="tel" maxLength={30} required />
      </label>
      <label htmlFor="email">
        Adresse e-mail
        <input id="email" type="email" name="email" value={email} readOnly />
      </label>
      <label htmlFor="anmeCode">
        Code ANME de l’installateur
        <input id="anmeCode" name="anmeCode" minLength={3} maxLength={40} required />
      </label>
      <label htmlFor="password">
        Mot de passe
        <input id="password" type="password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required />
      </label>
      <label htmlFor="confirmation">
        Confirmation du mot de passe
        <input id="confirmation" type="password" name="confirmation" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required />
      </label>
      <p className="login-field-hint">{MIN_PASSWORD_LENGTH} caractères minimum.</p>
      {state?.error && <p className="login-error" role="alert" aria-live="polite">{state.error}</p>}
      <button type="submit" className="login-submit" disabled={pending}>
        {pending ? 'Création en cours…' : 'Créer mon compte'}
        {!pending && <span aria-hidden="true">→</span>}
      </button>
    </form>
  );
}
