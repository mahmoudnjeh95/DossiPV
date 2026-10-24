'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from './actions';
import { BrandMark } from '../../components/brand-mark';

// Public page (outside the (app) layout): same two-panel look as /login.
export default function ForgotPasswordPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, undefined);

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

      <section className="login-form-panel" aria-labelledby="forgot-title">
        <div className="login-form-wrap">
          <Link href="/" className="login-mobile-brand" aria-label="Retour à l’accueil SolarixPro">
            <BrandMark compact />
          </Link>
          <p className="eyebrow login-eyebrow">MOT DE PASSE OUBLIÉ</p>
          <h2 id="forgot-title">Choisir un nouveau mot de passe.</h2>
          {state?.sent ? (
            <p className="login-notice" role="status">{state.message}</p>
          ) : (
            <>
              <p className="login-intro">Saisissez l’adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
              <form action={formAction} className="login-form">
                <label htmlFor="email">
                  Adresse e-mail
                  <input id="email" type="email" name="email" autoComplete="email" required />
                </label>
                {state?.error && <p className="login-error" role="alert" aria-live="polite">{state.error}</p>}
                <button type="submit" className="login-submit" disabled={pending}>
                  {pending ? 'Envoi en cours…' : 'Recevoir le lien'}
                  {!pending && <span aria-hidden="true">→</span>}
                </button>
              </form>
            </>
          )}
          <Link href="/login" className="login-back-link"><span aria-hidden="true">←</span> Retour à la connexion</Link>
        </div>
      </section>
    </main>
  );
}
