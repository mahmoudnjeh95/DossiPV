'use client';

import { useActionState, type ReactNode } from 'react';
import Link from 'next/link';
import { loginAction } from './actions';
import { BrandMark } from '../../components/brand-mark';
import { ResendVerificationForm } from '../inscription/resend-form';

interface LoginFormProps {
  passwordWasReset: boolean;
  accountWasCreated: boolean;
  loginRequired: boolean;
  /** Server-rendered « contactez SolarixPro » links for suppliers (null when no contact is configured). */
  supplierContact: ReactNode;
}

export function LoginForm({ passwordWasReset, accountWasCreated, loginRequired, supplierContact }: LoginFormProps): React.JSX.Element {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main className="login-page">
      <section className="login-story" aria-label="SolarixPro">
        <Link href="/" aria-label="Retour à l’accueil SolarixPro">
          <BrandMark inverse />
        </Link>
        <div className="login-story-content">
          <p className="eyebrow"><span className="eyebrow-mark" /> VOTRE ESPACE DE TRAVAIL</p>
          <h1>Le technique, <span>clairement organisé.</span></h1>
          <p>Retrouvez vos projets photovoltaïques et poursuivez la préparation de vos dossiers.</p>
          <div className="login-story-rule" />
          <span className="login-story-caption">Dossiers photovoltaïques basse tension</span>
        </div>
        <span className="login-story-foot">SOLARIXPRO <i /> ESPACE SÉCURISÉ</span>
      </section>

      <section className="login-form-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <Link href="/" className="login-mobile-brand" aria-label="Retour à l’accueil SolarixPro">
            <BrandMark compact />
          </Link>
          <p className="eyebrow login-eyebrow">CONNEXION</p>
          <h2 id="login-title">Ravi de vous revoir.</h2>
          <p className="login-intro">Connectez-vous pour retrouver votre espace et vos dossiers.</p>
          {passwordWasReset && !state?.error && (
            <p className="login-notice" role="status">Votre mot de passe a été changé : connectez-vous.</p>
          )}
          {loginRequired && !passwordWasReset && !accountWasCreated && !state?.error && (
            <p className="login-notice" role="status">Connectez-vous pour accéder à votre espace.</p>
          )}
          {accountWasCreated && !state?.error && <p className="login-notice" role="status">Compte créé, connectez-vous.</p>}
          <form action={formAction} className="login-form">
            <label htmlFor="email">
              Adresse e-mail
              <input id="email" type="email" name="email" autoComplete="email" required />
            </label>
            <label htmlFor="password">
              Mot de passe
              <input id="password" type="password" name="password" autoComplete="current-password" required />
            </label>
            {state?.error && <p className="login-error" role="alert" aria-live="polite">{state.error}</p>}
            <button type="submit" className="login-submit" disabled={pending}>
              {pending ? 'Connexion en cours…' : 'Se connecter'}
              {!pending && <span aria-hidden="true">→</span>}
            </button>
          </form>
          {state?.unverifiedEmail && <ResendVerificationForm defaultEmail={state.unverifiedEmail} />}
          <Link href="/mot-de-passe-oublie" className="login-forgot-link">Mot de passe oublié ?</Link>
          <p className="login-help">Pas encore de compte ? <Link href="/inscription" className="login-forgot-link">Créer un compte</Link></p>
          <p className="login-help">
            Vous êtes fournisseur ? Contactez SolarixPro{supplierContact ? <> : {supplierContact}</> : ' pour obtenir votre accès'}.
          </p>
          <p className="login-help">Un problème d’accès ? Contactez le responsable de votre compte.</p>
          <Link href="/" className="login-back-link"><span aria-hidden="true">←</span> Retour à l’accueil</Link>
        </div>
      </section>
    </main>
  );
}
