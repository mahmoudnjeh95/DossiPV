'use client';

import Link from 'next/link';
import { SolarixProLogo } from '@dossipv/icons';
import styles from './landing.module.css';

/**
 * Full-viewport hero for the public landing page.
 *
 * Purely presentational: the "click anywhere to continue" behaviour is owned
 * by the parent page, which wraps this section in its dismiss handler.
 */
export function LandingHero(): React.JSX.Element {
  return (
    <section className={styles.hero} aria-labelledby="landing-hero-title" lang="en">
      <div className={styles.heroInner}>
        <div className={styles.logo}>
          <SolarixProLogo size="lg" />
        </div>

        <h1 id="landing-hero-title" className={styles.headline}>
          Professional PV Dossier Generation
        </h1>

        <p className={styles.subheadline}>
          Streamline your STEG technical documentation with precision and speed.
        </p>

        <div className={styles.heroActions}>
          <Link href="/login" className={`${styles.button} ${styles.buttonOutline}`}>
            Log in
          </Link>
          <Link href="/login?mode=signup" className={`${styles.button} ${styles.buttonPrimary}`}>
            Get started
          </Link>
        </div>

        <p className={styles.hint}>
          Click or tap anywhere to continue
          <svg
            className={styles.hintIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </p>
      </div>

      <PanelArray />
    </section>
  );
}

/** One row of the horizon array: smaller and fainter rows read as further away. */
interface ArrayRow {
  id: string;
  y: number;
  scale: number;
  offsetX: number;
  opacity: number;
}

// Panels are 110 units wide including their slant, so a 100-unit tile leaves
// a 12-unit gap: close enough to read as continuous strings of modules.
const TILE_WIDTH = 100;
const TILE_HEIGHT = 60;

const ARRAY_ROWS: readonly ArrayRow[] = [
  { id: 'landing-array-back', y: 24, scale: 0.5, offsetX: 18, opacity: 0.5 },
  { id: 'landing-array-mid', y: 58, scale: 0.72, offsetX: 46, opacity: 0.75 },
  { id: 'landing-array-front', y: 116, scale: 1, offsetX: -30, opacity: 1 },
];

/** The logo's tilted panel (same 2:1 parallelogram), with a 4 x 2 cell grid. */
function PanelTile(): React.JSX.Element {
  return (
    <>
      <polygon points="4,56 92,56 114,12 26,12" fill="currentColor" fillOpacity="0.1" />
      <path
        d="M26 56 48 12 M48 56 70 12 M70 56 92 12 M15 34 103 34"
        stroke="#ffffff"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M26 12 114 12" strokeWidth="1.5" style={{ stroke: 'var(--color-gold)' }} />
    </>
  );
}

function PanelArray(): React.JSX.Element {
  return (
    <div className={styles.array} aria-hidden="true">
      <svg
        className={styles.arraySvg}
        viewBox="0 0 1440 176"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          {ARRAY_ROWS.map((row) => (
            <pattern
              key={row.id}
              id={row.id}
              patternUnits="userSpaceOnUse"
              x={row.offsetX}
              y={row.y}
              width={TILE_WIDTH * row.scale}
              height={TILE_HEIGHT * row.scale}
            >
              <g transform={`scale(${row.scale})`}>
                <PanelTile />
              </g>
            </pattern>
          ))}
        </defs>
        {ARRAY_ROWS.map((row) => (
          <rect
            key={row.id}
            x="0"
            y={row.y}
            width="1440"
            height={TILE_HEIGHT * row.scale}
            fill={`url(#${row.id})`}
            opacity={row.opacity}
          />
        ))}
      </svg>
    </div>
  );
}
