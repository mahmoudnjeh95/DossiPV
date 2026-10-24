import Link from 'next/link';
import { findValidPasswordResetToken, MIN_PASSWORD_LENGTH } from '@dossipv/auth';
import { BrandMark } from '../../components/brand-mark';
import { ResetPasswordForm } from './reset-password-form';

// Public page (outside the (app) layout), reached from a reset email: the installer's own
// "mot de passe oublié" link (1 hour) or a link sent by the admin, which may be a 7-day
// account-setup link — so nothing here mentions a lifetime.
export const dynamic = 'force-dynamic';

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps): Promise<React.JSX.Element> {
  const { token: tokenParam } = await searchParams;
  const token = typeof tokenParam === 'string' ? tokenParam : '';
  const valid = token ? await findValidPasswordResetToken(token) : null;

  return (
    <main className="login-page">
      <section className="login-story" aria-label="DossiPV">
        <Link href="/" aria-label="Retour à l’accueil DossiPV">
          <BrandMark inverse />
        </Link>
        <div className="login-story-content">
          <p className="eyebrow"><span className="eyebrow-mark" /> VOTRE ESPACE DE TRAVAIL</p>
          <h1>Le technique, <span>clairement organisé.</span></h1>
          <p>Retrouvez vos projets photovoltaïques et poursuivez la préparation de vos dossiers.</p>
          <div className="login-story-rule" />
          <span className="login-story-caption">Dossiers photovoltaïques basse tension</span>
        </div>
        <span className="login-story-foot">DOSSI PV <i /> ESPACE SÉCURISÉ</span>
      </section>

      <section className="login-form-panel" aria-labelledby="reset-title">
        <div className="login-form-wrap">
          <Link href="/" className="login-mobile-brand" aria-label="Retour à l’accueil DossiPV">
            <BrandMark compact />
          </Link>
          <p className="eyebrow login-eyebrow">NOUVEAU MOT DE PASSE</p>
          {valid ? (
            <>
              <h2 id="reset-title">Choisissez votre mot de passe.</h2>
              <p className="login-intro">Il remplacera l’ancien et fermera les sessions ouvertes sur vos autres appareils.</p>
              <ResetPasswordForm token={token} email={valid.email} minPasswordLength={MIN_PASSWORD_LENGTH} />
            </>
          ) : (
            <>
              <h2 id="reset-title">Ce lien n’est plus valide.</h2>
              <p className="login-intro">Il a déjà servi, a expiré ou a été remplacé par un lien plus récent.</p>
              <Link href="/mot-de-passe-oublie" className="button login-submit login-link-button">
                Demander un nouveau lien <span aria-hidden="true">→</span>
              </Link>
            </>
          )}
          <Link href="/login" className="login-back-link"><span aria-hidden="true">←</span> Retour à la connexion</Link>
        </div>
      </section>
    </main>
  );
}
