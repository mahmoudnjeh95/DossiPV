import Link from 'next/link';
import { BrandMark, SunSymbol } from '../components/brand-mark';
import { CountUp } from '../components/count-up';
import { Reveal } from '../components/reveal';

const FEATURES = [
  { icon: 'M4 5h16v14H4zM4 10h16M9 5v14', title: 'Dossier structuré', text: 'Client, site, équipements et contrôles réunis dans un parcours clair, du premier relevé au document final.' },
  { icon: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', title: 'Carte et implantation', text: 'Dessinez la toiture sur la carte, placez les modules et obtenez un plan d’implantation propre.' },
  { icon: 'M13 2 4 14h7l-1 8 9-12h-7z', title: 'Facture STEG importée', text: 'Importez la facture du client : la consommation et les données utiles sont lues pour vous.' },
  { icon: 'M3 20h18M6 20V10M12 20V4M18 20v-7', title: 'Simulation de production', text: 'Estimez la production annuelle de l’installation avec des données d’ensoleillement fiables.' },
  { icon: 'M4 7h6v4H4zM14 13h6v4h-6zM10 9h2a2 2 0 0 1 2 2v2', title: 'Schémas électriques', text: 'Schéma unifilaire et plans générés automatiquement à partir de votre configuration.' },
  { icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7', title: 'PDF prêt à déposer', text: 'Un dossier technique complet, mis en page selon les attentes, généré en quelques instants.' },
] as const;

const STEPS = [
  { n: '01', title: 'Renseignez le projet', text: 'Client, adresse, consommation : saisie guidée ou import de la facture.' },
  { n: '02', title: 'Dimensionnez', text: 'Choisissez modules et onduleur dans le catalogue et validez les contrôles techniques.' },
  { n: '03', title: 'Générez le dossier', text: 'Téléchargez le dossier technique complet, schémas et plans inclus.' },
] as const;

export default function HomePage(): React.JSX.Element {
  return (
    <main className="sx-page">
      <header className="sx-header">
        <Link href="/" aria-label="SolarixPro, accueil" className="sx-header-brand">
          <BrandMark compact />
        </Link>
        <nav className="sx-header-nav" aria-label="Sections">
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#parcours">Comment ça marche</a>
        </nav>
        <div className="sx-header-actions">
          <Link href="/login" className="button secondary small">Se connecter</Link>
          <Link href="/inscription" className="button small sx-cta-gold">Essai gratuit</Link>
        </div>
      </header>

      <section className="sx-hero" aria-labelledby="sx-title">
        <div className="sx-hero-glow" aria-hidden="true" />
        <div className="sx-hero-copy">
          <p className="sx-pill"><span className="sx-pill-dot" /> Dossiers photovoltaïques basse tension</p>
          <h1 id="sx-title">
            Le dossier PV, <span>prêt plus vite, sans erreur.</span>
          </h1>
          <p className="sx-lead">
            SolarixPro réunit la saisie du projet, la carte, le catalogue d’équipements et la génération du dossier technique : tout au même endroit, pour les installateurs.
          </p>
          <div className="sx-hero-actions">
            <Link href="/inscription" className="button sx-cta-gold">Commencer l’essai gratuit <span aria-hidden="true">→</span></Link>
            <Link href="/login" className="button secondary">Accéder à mon espace</Link>
          </div>
          <ul className="sx-hero-points" aria-label="Points clés">
            <li>3 dossiers offerts</li>
            <li>30 jours d’essai</li>
            <li>Sans engagement</li>
          </ul>
        </div>

        <div className="sx-hero-visual" aria-hidden="true">
          <div className="sx-orbit">
            <SunSymbol className="sx-orbit-sun" />
          </div>
          <div className="sx-doc">
            <div className="sx-doc-head">
              <BrandMark compact />
              <span className="sx-doc-status"><i /> En cours</span>
            </div>
            <strong>Installation photovoltaïque 5 kWc</strong>
            <span className="sx-doc-sub">Dossier technique BT</span>
            <div className="sx-doc-bar"><span /></div>
            <ol>
              <li><b>✓</b> Client et référence</li>
              <li><b>✓</b> Site et implantation</li>
              <li><b>✓</b> Équipements</li>
              <li className="sx-doc-pending"><b /> Génération du dossier</li>
            </ol>
          </div>
          <div className="sx-chip sx-chip-a"><span>Production estimée</span><strong>8 120 kWh/an</strong></div>
          <div className="sx-chip sx-chip-b"><span>Contrôles</span><strong>Tous validés</strong></div>
        </div>
      </section>

      <section className="sx-stats" aria-label="En chiffres">
        <Reveal><strong><CountUp to={3} /></strong><span>dossiers offerts à l’inscription</span></Reveal>
        <Reveal delay={80}><strong><CountUp to={30} /></strong><span>jours d’essai gratuit</span></Reveal>
        <Reveal delay={160}><strong><CountUp to={9} /></strong><span>familles d’équipements au catalogue</span></Reveal>
        <Reveal delay={240}><strong><CountUp to={1} /></strong><span>seul outil, du relevé au PDF</span></Reveal>
      </section>

      <section id="fonctionnalites" className="sx-section" aria-labelledby="sx-features-title">
        <Reveal className="sx-section-head">
          <p className="sx-kicker">Fonctionnalités</p>
          <h2 id="sx-features-title">Tout ce qu’il faut pour un dossier complet</h2>
          <p>Moins de ressaisie, plus de lisibilité : les données du projet restent liées jusqu’au document final.</p>
        </Reveal>
        <div className="sx-feature-grid">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 70} className="sx-feature">
              <span className="sx-feature-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={feature.icon} /></svg>
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="parcours" className="sx-section sx-steps-section" aria-labelledby="sx-steps-title">
        <Reveal className="sx-section-head">
          <p className="sx-kicker">Comment ça marche</p>
          <h2 id="sx-steps-title">Trois étapes, du relevé au dossier</h2>
        </Reveal>
        <ol className="sx-steps">
          {STEPS.map((step, index) => (
            <Reveal key={step.n} as="li" delay={index * 110} className="sx-step">
              <span className="sx-step-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <Reveal as="section" className="sx-final">
        <h2>Prêt à gagner du temps sur vos dossiers ?</h2>
        <p>Créez votre compte : 3 dossiers offerts pendant 30 jours.</p>
        <div className="sx-hero-actions sx-final-actions">
          <Link href="/inscription" className="button sx-cta-gold">Créer mon compte <span aria-hidden="true">→</span></Link>
          <Link href="/login" className="button sx-ghost">Se connecter</Link>
        </div>
      </Reveal>

      <footer className="sx-footer">
        <BrandMark inverse />
        <p>Conçu pour la préparation de dossiers photovoltaïques basse tension.</p>
        <nav aria-label="Liens">
          <Link href="/login">Connexion</Link>
          <Link href="/inscription">Créer un compte</Link>
        </nav>
        <small>© {new Date().getFullYear()} SolarixPro. Tous droits réservés.</small>
      </footer>
    </main>
  );
}
