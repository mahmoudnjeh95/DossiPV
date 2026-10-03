import type { ComponentType } from 'react';
import { Check, ICON_SIZES, Shield, TrendUp, type IconProps } from '@dossipv/icons';
import styles from './landing.module.css';

interface Feature {
  icon: ComponentType<IconProps>;
  title: string;
  description: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: Check,
    title: 'Precision & compliance',
    description:
      // Non-breaking space and hyphen keep the standard's name on one line.
      'Every design runs through 22 automated checks against NF C 15‑100 and STEG requirements before a dossier is produced.',
  },
  {
    icon: TrendUp,
    title: 'Speed',
    description:
      'Go from site data to a complete technical dossier in minutes instead of hours of manual drafting.',
  },
  {
    icon: Shield,
    title: 'Enterprise grade',
    description:
      'Company accounts, secure sign-in and private project storage, built for professional installation teams.',
  },
];

function FeatureCard({ icon: Icon, title, description }: Feature): React.JSX.Element {
  return (
    <li className={styles.featureCard}>
      <span className={styles.featureIcon}>
        {/* The package's category icons spread props straight onto <svg>, so
            size them with explicit dimensions rather than the `size` prop. */}
        <Icon
          width={ICON_SIZES.lg}
          height={ICON_SIZES.lg}
          aria-hidden="true"
          focusable="false"
        />
      </span>
      <div>
        <h3 className={styles.featureTitle}>{title}</h3>
        <p className={styles.featureText}>{description}</p>
      </div>
    </li>
  );
}

export function LandingFeatures(): React.JSX.Element {
  return (
    <section className={styles.features} aria-labelledby="landing-features-title" lang="en">
      <div className={styles.container}>
        <header className={styles.sectionHeader}>
          <h2 id="landing-features-title" className={styles.sectionTitle}>
            Why SOLARIX PRO?
          </h2>
          <p className={styles.sectionIntro}>
            Built for Tunisian PV installers who file low&#8209;voltage grid connection dossiers
            with STEG.
          </p>
        </header>

        <ul className={styles.featureGrid}>
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </ul>
      </div>
    </section>
  );
}
