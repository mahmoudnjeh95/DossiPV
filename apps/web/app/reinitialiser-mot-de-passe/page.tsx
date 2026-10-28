import type { Metadata } from 'next';
import Link from 'next/link';
import { findValidPasswordResetToken, MIN_PASSWORD_LENGTH } from '@dossipv/auth';
import { AuthBackLink, AuthIntro, AuthShell, authSubmitClass } from '@/components/auth/auth-ui';
import { ResetPasswordForm } from './reset-password-form';
import { NO_INDEX } from '../../lib/site';

// Behind a login or a one-time token: never in search results.
export const metadata: Metadata = { robots: NO_INDEX };

// Public page (outside the (app) layout), reached from a reset email: the installer's own
// "mot de passe oublié" link (1 hour) or a link sent by the admin, which may be a 7-day
// account-setup link — so nothing here mentions a lifetime.
export const dynamic = 'force-dynamic';

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps): Promise<React.JSX.Element> {
  const { token: tokenParam } = await searchParams;
  const token = typeof tokenParam === 'string' ? tokenParam : '';
  const valid = token ? await findValidPasswordResetToken(token) : null;

  return (
    <AuthShell titleId="reset-title" eyebrow="NOUVEAU MOT DE PASSE">
      {valid ? (
        <>
          <h2 id="reset-title">Choisissez votre mot de passe.</h2>
          <AuthIntro>
            Il remplacera l’ancien et fermera les sessions ouvertes sur vos autres appareils.
          </AuthIntro>
          <ResetPasswordForm
            token={token}
            email={valid.email}
            minPasswordLength={MIN_PASSWORD_LENGTH}
          />
        </>
      ) : (
        <>
          <h2 id="reset-title">Ce lien n’est plus valide.</h2>
          <AuthIntro>
            Il a déjà servi, a expiré ou a été remplacé par un lien plus récent.
          </AuthIntro>
          <Link href="/mot-de-passe-oublie" className={authSubmitClass()}>
            Demander un nouveau lien <span aria-hidden="true">→</span>
          </Link>
        </>
      )}
      <AuthBackLink href="/login">Retour à la connexion</AuthBackLink>
    </AuthShell>
  );
}
