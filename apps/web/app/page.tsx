import Link from 'next/link';
import { BrandMark } from '../components/brand-mark';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <Link href="/" aria-label="DossiPV, accueil">
          <BrandMark />
        </Link>
        <div className="welcome-header-actions">
          <span className="welcome-header-note">Espace professionnel</span>
          <Link href="/login" className="button welcome-login-link">
            Se connecter <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="eyebrow"><span className="eyebrow-mark" /> OUTIL PROFESSIONNEL · PHOTOVOLTAÏQUE BT</p>
          <h1 id="welcome-title">Vos dossiers PV, <span>clairs du premier relevé au document final.</span></h1>
          <p className="welcome-description">
            Rassemblez les informations du client, du site et des équipements, puis préparez un dossier technique structuré au même endroit.
          </p>
          <div className="welcome-actions">
            <Link href="/login" className="button welcome-primary-cta">
              Accéder à mon espace <span aria-hidden="true">→</span>
            </Link>
            <span className="welcome-access-note">Connexion réservée aux comptes autorisés</span>
          </div>
          <div className="welcome-capabilities" aria-label="Fonctionnalités principales">
            <span><b>01</b> Informations projet organisées</span>
            <span><b>02</b> Contrôles techniques visibles</span>
            <span><b>03</b> Génération du dossier</span>
          </div>
        </div>

        <div className="welcome-visual" aria-hidden="true">
          <div className="visual-coordinate visual-coordinate-top">DOSSIER TECHNIQUE <span>BT / 2026</span></div>
          <div className="document-preview">
            <div className="document-preview-header">
              <BrandMark compact />
              <span className="document-status"><i /> BROUILLON</span>
            </div>
            <div className="document-preview-title">
              <span className="preview-kicker">NOUVEAU DOSSIER</span>
              <strong>Installation photovoltaïque</strong>
              <span>Parcours de préparation</span>
            </div>
            <div className="preview-progress"><span /></div>
            <div className="preview-progress-caption"><span>STRUCTURE DU DOSSIER</span><strong>04 sections</strong></div>
            <ol className="preview-sections">
              <li><span className="preview-section-index">01</span><span className="preview-section-copy"><strong>Client</strong><small>Coordonnées et référence</small></span><span className="preview-check">✓</span></li>
              <li><span className="preview-section-index">02</span><span className="preview-section-copy"><strong>Site</strong><small>Adresse et implantation</small></span><span className="preview-check">✓</span></li>
              <li><span className="preview-section-index">03</span><span className="preview-section-copy"><strong>Équipements</strong><small>Modules et onduleur</small></span><span className="preview-pending" /></li>
              <li><span className="preview-section-index">04</span><span className="preview-section-copy"><strong>Vérifications</strong><small>Contrôles avant génération</small></span><span className="preview-pending" /></li>
            </ol>
            <div className="preview-footer"><span>DOCUMENT STRUCTURÉ</span><span>PRÊT À COMPLÉTER <b>→</b></span></div>
          </div>
          <div className="visual-coordinate visual-coordinate-bottom"><span>36°48&apos; N</span> · TUNISIE</div>
          <div className="visual-sun" />
        </div>
      </section>

      <section className="welcome-details" aria-label="À propos de DossiPV">
        <p>UN PARCOURS STRUCTURÉ</p>
        <h2>Moins de dispersion. Plus de lisibilité.</h2>
        <span>Les données du projet, les contrôles et le dossier restent liés tout au long de la préparation.</span>
      </section>

      <footer className="welcome-footer">
        <BrandMark compact />
        <span>Conçu pour la préparation de dossiers photovoltaïques basse tension.</span>
      </footer>
    </main>
  );
}
