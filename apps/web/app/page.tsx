import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark, SunSymbol } from '../components/brand-mark';
import { CountUp } from '../components/count-up';
import { Reveal } from '../components/reveal';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '../lib/site';

export const metadata: Metadata = { alternates: { canonical: '/' }, openGraph: { url: '/' } };

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

const FAQ = [
  {
    q: 'Qu’est-ce que SolarixPro ?',
    a: 'Un logiciel en ligne qui prépare le dossier technique des installations photovoltaïques basse tension raccordées au réseau STEG : saisie du projet, dimensionnement, contrôles électriques, schémas et PDF final.',
  },
  {
    q: 'À qui s’adresse SolarixPro ?',
    a: 'Aux installateurs et bureaux d’études photovoltaïques qui montent des dossiers de raccordement BT pour leurs clients résidentiels ou professionnels.',
  },
  {
    q: 'Que contient le dossier généré ?',
    a: 'Les informations client et site, le choix des modules et de l’onduleur, les contrôles techniques, l’estimation de production, le schéma unifilaire et le plan d’implantation, réunis dans un PDF prêt à déposer.',
  },
  {
    q: 'Peut-on essayer gratuitement ?',
    a: 'Oui : à l’inscription, 3 dossiers sont offerts pendant 30 jours, sans engagement.',
  },
] as const;

/** schema.org description of the product and its FAQ, read by search engines for rich results. */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: 'fr',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'fr',
      areaServed: 'TN',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'TND', description: 'Essai gratuit : 3 dossiers pendant 30 jours' },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ],
};

const GUTTER = 'px-[max(var(--gutter),calc((100%-1200px)/2))]';
const CTA = 'min-h-[50px] px-[22px] max-[700px]:flex-[1_1_100%]';
const NAV_LINK = 'font-semibold text-[#dbe5fa] no-underline hover:text-[#ffc43d]';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="m-0 max-w-none overflow-x-clip bg-white p-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, '\\u003c') }} />
      <header
        className={cn(
          'sticky top-0 z-20 flex animate-[sx-fade_0.5s_ease_backwards] items-center gap-7 border-b border-app-border/80 bg-white/85 py-3 backdrop-blur-md backdrop-saturate-150 max-[700px]:gap-3',
          GUTTER,
        )}
      >
        <Link href="/" aria-label="SolarixPro, accueil" className="group no-underline max-[700px]:mr-auto">
          <BrandMark compact />
        </Link>
        <nav className="mr-auto flex gap-1.5 max-[700px]:hidden" aria-label="Sections">
          {[
            ['#fonctionnalites', 'Fonctionnalités'],
            ['#parcours', 'Comment ça marche'],
            ['#questions', 'Questions'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 font-semibold text-app-muted no-underline transition-colors duration-200 hover:bg-app-accent-soft hover:text-app-navy"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex gap-2.5">
          <Link href="/login" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'max-[700px]:hidden')}>
            Se connecter
          </Link>
          <Link href="/inscription" className={buttonVariants({ variant: 'gold', size: 'sm' })}>
            Essai gratuit
          </Link>
        </div>
      </header>

      <section
        className={cn(
          'relative grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center gap-12 overflow-hidden bg-[linear-gradient(rgba(29,75,151,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(29,75,151,0.045)_1px,transparent_1px),linear-gradient(180deg,#f4f7fd,#fff)] bg-[length:44px_44px,44px_44px,auto] pt-[72px] pb-[88px] max-[960px]:grid-cols-1 max-[960px]:pt-12',
          GUTTER,
        )}
        aria-labelledby="sx-title"
      >
        <div
          className="pointer-events-none absolute -top-[180px] -right-[140px] size-[620px] animate-[sx-pulse_7s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,rgba(255,196,61,0.55),rgba(255,196,61,0)_68%)] motion-reduce:animate-none"
          aria-hidden="true"
        />
        <div className="relative *:animate-[sx-rise_0.7s_var(--ease-out)_backwards] *:nth-2:[animation-delay:80ms] *:nth-3:[animation-delay:160ms] *:nth-4:[animation-delay:240ms] *:nth-5:[animation-delay:320ms]">
          <p className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-app-accent/20 bg-white px-3.5 py-1.5 text-[0.82rem] font-bold text-app-accent shadow-[0_6px_18px_-10px_rgba(11,31,74,0.4)]">
            <span className="size-2 animate-[sx-ping_2s_ease-out_infinite] rounded-full bg-app-gold motion-reduce:animate-none" /> Dossiers photovoltaïques basse tension
          </p>
          <h1
            id="sx-title"
            className="m-0 max-w-[640px] text-[clamp(2.3rem,5vw,3.8rem)] leading-[1.07] font-extrabold tracking-[-0.03em]"
          >
            Le dossier PV,{' '}
            <span className="bg-[linear-gradient(100deg,#1d4b97_10%,#e8a317_90%)] bg-clip-text text-transparent">prêt plus vite, sans erreur.</span>
          </h1>
          <p className="mt-[22px] mb-0 max-w-[560px] text-[1.1rem] leading-[1.7] text-app-muted">
            SolarixPro réunit la saisie du projet, la carte, le catalogue d’équipements et la génération du dossier technique : tout au même endroit, pour les installateurs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/inscription" className={cn(buttonVariants({ variant: 'gold' }), CTA)}>
              Commencer l’essai gratuit <span aria-hidden="true">→</span>
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: 'secondary' }), CTA)}>
              Accéder à mon espace
            </Link>
          </div>
          <ul className="m-0 mt-[26px] flex list-none flex-wrap gap-x-[22px] gap-y-2 p-0 text-[0.92rem] font-semibold text-app-muted" aria-label="Points clés">
            {['3 dossiers offerts', '30 jours d’essai', 'Sans engagement'].map((point) => (
              <li key={point} className="before:mr-2 before:font-extrabold before:text-app-ok before:content-['✓']">
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative min-h-[460px] max-[960px]:min-h-[430px]" aria-hidden="true">
          <div className="absolute -top-2.5 -right-2.5 size-[150px] animate-[sx-spin_40s_linear_infinite] rounded-full border border-dashed border-app-accent/30 max-[700px]:hidden motion-reduce:animate-none">
            <SunSymbol className="absolute -top-[22px] left-1/2 -ml-[22px] size-11" />
          </div>
          <div className="absolute top-10 left-[8%] w-[min(380px,88%)] animate-[sx-float_7s_ease-in-out_infinite,sx-rise_0.9s_0.2s_var(--ease-out)_backwards] rounded-[18px] border border-app-border bg-white p-[22px] shadow-[0_30px_60px_-24px_rgba(11,31,74,0.4),0_2px_6px_rgba(11,31,74,0.06)] max-[700px]:left-0 max-[700px]:w-[92%] motion-reduce:animate-none">
            <div className="mb-[18px] flex items-center justify-between">
              <BrandMark compact small />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-gold-soft) px-2.5 py-1 text-[0.72rem] font-bold text-app-warn">
                <i className="size-1.5 animate-[sx-pulse_1.6s_ease-in-out_infinite] rounded-full bg-app-gold" /> En cours
              </span>
            </div>
            <strong className="block text-[1.05rem] text-app-navy">Installation photovoltaïque 5 kWc</strong>
            <span className="text-[0.85rem] text-app-muted">Dossier technique BT</span>
            <div className="my-4 h-2 overflow-hidden rounded-lg bg-app-accent-soft">
              <span className="block h-full w-3/4 origin-left animate-[sx-grow_1.6s_0.7s_var(--ease-out)_backwards,sx-shimmer_3s_linear_infinite] rounded-lg bg-[linear-gradient(90deg,#1d4b97,#e8a317)] bg-[length:200%_100%]" />
            </div>
            <ol className="m-0 grid list-none gap-2.5 p-0 text-[0.92rem] font-semibold">
              {['Client et référence', 'Site et implantation', 'Équipements'].map((step, index) => (
                <li key={step} className="flex items-center gap-2.5">
                  <b
                    className="grid size-[22px] animate-[sx-pop_0.5s_var(--ease-out)_backwards] place-items-center rounded-full bg-app-ok-bg text-[0.72rem] text-app-ok"
                    style={{ animationDelay: `${0.9 + index * 0.25}s` }}
                  >
                    ✓
                  </b>{' '}
                  {step}
                </li>
              ))}
              <li className="flex items-center gap-2.5 text-app-muted">
                <b className="grid size-[22px] place-items-center rounded-full border-2 border-dashed border-[#b9c4db]" /> Génération du dossier
              </li>
            </ol>
          </div>
          <div className="absolute right-0 bottom-[70px] grid animate-[sx-float_6s_ease-in-out_infinite] gap-0.5 rounded-[14px] border border-app-border bg-white/95 px-4 py-3 shadow-lift [animation-delay:-2s] motion-reduce:animate-none">
            <span className="text-[0.72rem] font-[650] text-app-muted">Production estimée</span>
            <strong className="text-base text-app-navy">8 120 kWh/an</strong>
          </div>
          <div className="absolute bottom-2.5 left-0 grid animate-[sx-float_6s_ease-in-out_infinite] gap-0.5 rounded-[14px] border border-app-border bg-white/95 px-4 py-3 shadow-lift [animation-delay:-4s] motion-reduce:animate-none">
            <span className="text-[0.72rem] font-[650] text-app-muted">Contrôles</span>
            <strong className="text-base text-app-ok">Tous validés</strong>
          </div>
        </div>
      </section>

      <section
        className="relative mx-auto -mt-[42px] grid max-w-[1200px] grid-cols-4 gap-4 rounded-[18px] border border-app-border bg-white px-7 py-[26px] shadow-lift max-[960px]:mx-(--gutter) max-[960px]:grid-cols-2 *:grid *:gap-0.5 *:text-center [&_strong]:bg-[linear-gradient(100deg,#0b1f4a,#1d4b97)] [&_strong]:bg-clip-text [&_strong]:text-[2.3rem] [&_strong]:leading-[1.1] [&_strong]:font-extrabold [&_strong]:text-transparent [&_div>span]:text-[0.88rem] [&_div>span]:font-semibold [&_div>span]:text-app-muted"
        aria-label="En chiffres"
      >
        <Reveal><strong><CountUp to={3} /></strong><span>dossiers offerts à l’inscription</span></Reveal>
        <Reveal delay={80}><strong><CountUp to={30} /></strong><span>jours d’essai gratuit</span></Reveal>
        <Reveal delay={160}><strong><CountUp to={9} /></strong><span>familles d’équipements au catalogue</span></Reveal>
        <Reveal delay={240}><strong><CountUp to={1} /></strong><span>seul outil, du relevé au PDF</span></Reveal>
      </section>

      <section id="fonctionnalites" className="mx-auto max-w-[1200px] px-(--gutter) pt-24 pb-6 max-[700px]:pt-16" aria-labelledby="sx-features-title">
        <SectionHead kicker="Fonctionnalités" id="sx-features-title" title="Tout ce qu’il faut pour un dossier complet">
          Moins de ressaisie, plus de lisibilité : les données du projet restent liées jusqu’au document final.
        </SectionHead>
        <div className="grid grid-cols-3 gap-5 max-[960px]:grid-cols-2 max-[700px]:grid-cols-1">
          {FEATURES.map((feature, index) => (
            <Reveal
              key={feature.title}
              delay={index * 70}
              className="group rounded-[18px] border border-app-border bg-white p-7 shadow-card transition-[transform,box-shadow,border-color,opacity] duration-300 hover:-translate-y-1.5 hover:border-app-gold/60 hover:shadow-lift"
            >
              <span className="mb-[18px] grid size-[52px] place-items-center rounded-[14px] bg-[linear-gradient(135deg,#1d4b97,#0b1f4a)] shadow-[0_10px_20px_-10px_rgba(11,31,74,0.7)] transition-transform duration-[350ms] ease-(--ease-out) group-hover:-rotate-6 group-hover:scale-[1.08]">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[26px] fill-none stroke-[#ffc43d] stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]">
                  <path d={feature.icon} />
                </svg>
              </span>
              <h3 className="mb-2 text-[1.12rem] text-app-navy">{feature.title}</h3>
              <p className="m-0 text-app-muted">{feature.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="parcours" className="mx-auto max-w-[1200px] px-(--gutter) pt-24 pb-6 max-[700px]:pt-16" aria-labelledby="sx-steps-title">
        <SectionHead kicker="Comment ça marche" id="sx-steps-title" title="Trois étapes, du relevé au dossier" />
        <ol className="relative m-0 grid list-none grid-cols-3 gap-5 p-0 max-[960px]:grid-cols-2 max-[700px]:grid-cols-1">
          {STEPS.map((step, index) => (
            <Reveal
              key={step.n}
              as="li"
              delay={index * 110}
              className="relative rounded-[18px] border border-app-border bg-linear-to-b from-[#f4f7fd] to-white p-7"
            >
              <span className="mb-3.5 inline-block bg-[linear-gradient(100deg,#e8a317,#ffc43d)] bg-clip-text text-[2.6rem] leading-none font-extrabold text-transparent">
                {step.n}
              </span>
              <h3 className="mb-2 text-app-navy">{step.title}</h3>
              <p className="m-0 text-app-muted">{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="questions" className="mx-auto max-w-[820px] px-(--gutter) pt-24 max-[700px]:pt-16" aria-labelledby="sx-faq-title">
        <SectionHead kicker="Questions fréquentes" id="sx-faq-title" title="Ce qu’il faut savoir sur SolarixPro" />
        <div className="grid gap-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group rounded-[14px] border border-app-border bg-white px-5 py-4 open:shadow-lift">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-app-navy">
                <h3 className="m-0 text-[1.02rem]">{q}</h3>
                <span aria-hidden="true" className="text-app-accent transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 mb-0 text-app-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <Reveal
        as="section"
        className="relative mx-auto mt-24 max-w-[1200px] overflow-hidden rounded-[28px] [background:radial-gradient(ellipse_60%_90%_at_100%_100%,rgba(232,163,23,0.45),transparent_70%),radial-gradient(ellipse_60%_80%_at_0%_0%,rgba(40,96,190,0.6),transparent_70%),#0b1f4a] px-8 py-16 text-center text-white"
      >
        <h2 className="m-0 text-[clamp(1.6rem,3.4vw,2.4rem)] tracking-[-0.02em] text-white">Prêt à gagner du temps sur vos dossiers ?</h2>
        <p className="mt-3 mb-0 text-[1.05rem] text-[#c9d6ee]">Créez votre compte : 3 dossiers offerts pendant 30 jours.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/inscription" className={cn(buttonVariants({ variant: 'gold' }), CTA)}>
            Créer mon compte <span aria-hidden="true">→</span>
          </Link>
          <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }), CTA)}>
            Se connecter
          </Link>
        </div>
      </Reveal>

      <footer className="mt-24 grid justify-items-center gap-3.5 bg-[#081a40] px-(--gutter) pt-12 pb-9 text-center text-[#aebddb]">
        <BrandMark inverse className="w-[170px]" />
        <p className="m-0">Conçu pour la préparation de dossiers photovoltaïques basse tension.</p>
        <nav className="flex gap-[22px]" aria-label="Liens">
          <Link href="/login" className={NAV_LINK}>Connexion</Link>
          <Link href="/inscription" className={NAV_LINK}>Créer un compte</Link>
        </nav>
        <nav className="flex flex-wrap justify-center gap-x-[22px] gap-y-2 text-[0.85rem]" aria-label="Informations légales">
          <Link href="/cgu" className={NAV_LINK}>Conditions générales</Link>
          <Link href="/confidentialite" className={NAV_LINK}>Confidentialité</Link>
          <Link href="/mentions-legales" className={NAV_LINK}>Mentions légales</Link>
        </nav>
        <small className="opacity-70">© {new Date().getFullYear()} SolarixPro. Tous droits réservés.</small>
      </footer>
    </main>
  );
}

function SectionHead({ kicker, id, title, children }: { kicker: string; id: string; title: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <Reveal className="mx-auto mb-12 max-w-[640px] text-center">
      <p className="mb-2.5 text-[0.8rem] font-extrabold tracking-[0.14em] text-[#b97d00] uppercase">{kicker}</p>
      <h2 id={id} className="m-0 text-[clamp(1.7rem,3.4vw,2.5rem)] leading-[1.15] tracking-[-0.02em]">{title}</h2>
      {children && <p className="mt-3.5 mb-0 text-[1.05rem] text-app-muted">{children}</p>}
    </Reveal>
  );
}
