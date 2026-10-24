import Link from 'next/link';
import { BrandMark } from '../../components/brand-mark';
import { findValidInvitation } from '../../lib/sponsorship';
import { currentInstallerCompany } from '../../lib/installer-session';
import { AcceptForm, CreateAccountForm } from './invitation-forms';

// Public page, reached from the supplier's invitation email: it depends on the link and the
// session, so it must never be cached or prerendered.
export const dynamic = 'force-dynamic';

interface InvitationPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function InvitationPage({ searchParams }: InvitationPageProps): Promise<React.JSX.Element> {
  const { token: tokenParam } = await searchParams;
  const token = typeof tokenParam === 'string' ? tokenParam : '';
  const invitation = token ? await findValidInvitation(token) : null;
  const installer = invitation ? await currentInstallerCompany() : null;

  return (
    <main className="login-page">
      <section className="login-story" aria-label="SolarixPro">
        <Link href="/" aria-label="Retour à l’accueil SolarixPro">
          <BrandMark inverse />
        </Link>
        <div className="login-story-content">
          <p className="eyebrow"><span className="eyebrow-mark" /> INVITATION</p>
          <h1>Le technique, <span>clairement organisé.</span></h1>
          <p>Préparez vos dossiers photovoltaïques basse tension avec le matériel de votre fournisseur.</p>
          <div className="login-story-rule" />
          <span className="login-story-caption">Dossiers photovoltaïques basse tension</span>
        </div>
        <span className="login-story-foot">SOLARIXPRO <i /> ESPACE SÉCURISÉ</span>
      </section>

      <section className="login-form-panel" aria-labelledby="invitation-title">
        <div className="login-form-wrap">
          <Link href="/" className="login-mobile-brand" aria-label="Retour à l’accueil SolarixPro">
            <BrandMark compact />
          </Link>
          <p className="eyebrow login-eyebrow">INVITATION</p>
          {!invitation ? (
            <>
              <h2 id="invitation-title">Cette invitation n’est plus valide.</h2>
              <p className="login-intro">
                Le lien a expiré (il est valable 7 jours), a déjà été utilisé ou a été annulé. Demandez à votre fournisseur de vous envoyer un
                nouveau lien d’invitation.
              </p>
            </>
          ) : (
            <>
              <h2 id="invitation-title">{invitation.supplierName} vous invite à utiliser SolarixPro.</h2>
              <p className="login-intro">
                Vous préparez vos dossiers avec les panneaux et onduleurs de {invitation.supplierName}, sous son abonnement.
              </p>
              {installer ? (
                <AcceptForm token={token} />
              ) : (
                <>
                  <p className="login-intro">
                    J’ai déjà un compte : <Link href="/login" className="login-forgot-link">me connecter</Link>, puis rouvrir ce lien pour accepter.
                  </p>
                  <h3>Je n’ai pas de compte : en créer un</h3>
                  <CreateAccountForm token={token} email={invitation.email} />
                </>
              )}
            </>
          )}
          <Link href="/login" className="login-back-link"><span aria-hidden="true">←</span> Retour à la connexion</Link>
        </div>
      </section>
    </main>
  );
}
