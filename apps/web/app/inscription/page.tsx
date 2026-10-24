'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpAction } from './actions';
import { GOVERNORATES } from './governorates';
import { PublicShell } from './public-shell';
import { ResendVerificationForm } from './resend-form';

// Password rules mirror @dossipv/auth (MIN_PASSWORD_LENGTH); importing it here would pull the
// database client into the browser bundle, and the server action checks them anyway.
const MIN_PASSWORD_LENGTH = 10;

export default function SignUpPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(signUpAction, undefined);
  const fields = state && !state.sent ? state.fields : undefined;

  if (state?.sent) {
    return (
      <PublicShell titleId="signup-title" eyebrow="INSCRIPTION">
        <h2 id="signup-title">Vérifiez votre boîte mail.</h2>
        <p className="login-notice" role="status">
          Nous venons d’envoyer un email à {state.email} : ouvrez-le pour confirmer votre adresse (lien valable 48 heures).
          Pensez à vérifier vos courriers indésirables.
        </p>
        <p className="login-intro">Vous n’avez rien reçu ? Demandez un nouvel email.</p>
        <ResendVerificationForm defaultEmail={state.email} />
        <Link href="/login" className="login-back-link"><span aria-hidden="true">←</span> Retour à la connexion</Link>
      </PublicShell>
    );
  }

  return (
    <PublicShell titleId="signup-title" eyebrow="INSCRIPTION">
      <h2 id="signup-title">Créez votre compte.</h2>
      <p className="login-intro">Essai gratuit : 3 dossiers pendant 30 jours, sans carte bancaire.</p>
      <form action={formAction} className="login-form">
        <label htmlFor="companyName">
          Raison sociale
          <input id="companyName" name="companyName" autoComplete="organization" maxLength={200} defaultValue={fields?.companyName} required />
        </label>
        <label htmlFor="contactName">
          Nom et prénom du contact
          <input id="contactName" name="contactName" autoComplete="name" maxLength={200} defaultValue={fields?.contactName} required />
        </label>
        <label htmlFor="phone">
          Téléphone
          <input id="phone" type="tel" name="phone" autoComplete="tel" maxLength={30} defaultValue={fields?.phone} required />
        </label>
        <label htmlFor="email">
          Adresse e-mail
          <input id="email" type="email" name="email" autoComplete="email" maxLength={200} defaultValue={fields?.email} required />
        </label>
        <label htmlFor="governorate">
          Gouvernorat
          <select id="governorate" name="governorate" defaultValue={fields?.governorate ?? ''} required>
            <option value="" disabled>Choisir…</option>
            {GOVERNORATES.map((governorate) => (
              <option key={governorate} value={governorate}>{governorate}</option>
            ))}
          </select>
        </label>
        <label htmlFor="anmeCode">
          Code ANME de l’installateur
          <input id="anmeCode" name="anmeCode" minLength={3} maxLength={40} defaultValue={fields?.anmeCode} required />
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
        {state && !state.sent && <p className="login-error" role="alert" aria-live="polite">{state.error}</p>}
        <button type="submit" className="login-submit" disabled={pending}>
          {pending ? 'Création en cours…' : 'Créer mon compte'}
          {!pending && <span aria-hidden="true">→</span>}
        </button>
      </form>
      <p className="login-help">Déjà un compte ? <Link href="/login" className="login-forgot-link">Se connecter</Link></p>
    </PublicShell>
  );
}
