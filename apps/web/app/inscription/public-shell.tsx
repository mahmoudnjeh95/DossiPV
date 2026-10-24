import Link from 'next/link';
import { BrandMark } from '../../components/brand-mark';

// The two-panel look shared by the public sign-up pages (/inscription, /verifier-email).
export function PublicShell({ titleId, eyebrow, children }: { titleId: string; eyebrow: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <main className="login-page">
      <section className="login-story" aria-label="SolarixPro">
        <Link href="/" aria-label="Retour à l’accueil SolarixPro">
          <BrandMark inverse />
        </Link>
        <div className="login-story-content">
          <p className="eyebrow"><span className="eyebrow-mark" /> ESSAI GRATUIT</p>
          <h1>Le technique, <span>clairement organisé.</span></h1>
          <p>Créez votre compte et préparez vos dossiers photovoltaïques basse tension : 3 dossiers offerts pendant 30 jours.</p>
          <div className="login-story-rule" />
          <span className="login-story-caption">Dossiers photovoltaïques basse tension</span>
        </div>
        <span className="login-story-foot">SOLARIXPRO <i /> ESPACE SÉCURISÉ</span>
      </section>

      <section className="login-form-panel" aria-labelledby={titleId}>
        <div className="login-form-wrap">
          <Link href="/" className="login-mobile-brand" aria-label="Retour à l’accueil SolarixPro">
            <BrandMark compact />
          </Link>
          <p className="eyebrow login-eyebrow">{eyebrow}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
