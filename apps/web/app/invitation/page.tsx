import type { Metadata } from 'next';
import { AuthBackLink, AuthInlineLink, AuthIntro, AuthShell } from '@/components/auth/auth-ui';
import { findValidInvitation } from '../../lib/sponsorship';
import { currentInstallerCompany } from '../../lib/installer-session';
import { AcceptForm, CreateAccountForm } from './invitation-forms';
import { NO_INDEX } from '../../lib/site';

// Behind a login or a one-time token: never in search results.
export const metadata: Metadata = { robots: NO_INDEX };

// Public page, reached from the supplier's invitation email: it depends on the link and the
// session, so it must never be cached or prerendered.
export const dynamic = 'force-dynamic';

interface InvitationPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function InvitationPage({
  searchParams,
}: InvitationPageProps): Promise<React.JSX.Element> {
  const { token: tokenParam } = await searchParams;
  const token = typeof tokenParam === 'string' ? tokenParam : '';
  const invitation = token ? await findValidInvitation(token) : null;
  const installer = invitation ? await currentInstallerCompany() : null;

  return (
    <AuthShell story="invitation" titleId="invitation-title" eyebrow="INVITATION">
      {!invitation ? (
        <>
          <h2 id="invitation-title">Cette invitation n’est plus valide.</h2>
          <AuthIntro>
            Le lien a expiré (il est valable 7 jours), a déjà été utilisé ou a été annulé. Demandez
            à votre fournisseur de vous envoyer un nouveau lien d’invitation.
          </AuthIntro>
        </>
      ) : (
        <>
          <h2 id="invitation-title">
            {invitation.supplierName} vous invite à utiliser SolarixPro.
          </h2>
          <AuthIntro>
            Vous préparez vos dossiers avec les panneaux et onduleurs de {invitation.supplierName},
            sous son abonnement.
          </AuthIntro>
          {installer ? (
            <AcceptForm token={token} />
          ) : (
            <>
              <AuthIntro>
                J’ai déjà un compte : <AuthInlineLink href="/login">me connecter</AuthInlineLink>,
                puis rouvrir ce lien pour accepter.
              </AuthIntro>
              <h3 className="mb-3 text-base">Je n’ai pas de compte : en créer un</h3>
              <CreateAccountForm token={token} email={invitation.email} />
            </>
          )}
        </>
      )}
      <AuthBackLink href="/login">Retour à la connexion</AuthBackLink>
    </AuthShell>
  );
}
