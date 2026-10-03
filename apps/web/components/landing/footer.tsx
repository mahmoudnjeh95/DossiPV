import Link from 'next/link';
import styles from './landing.module.css';

export function LandingFooter(): React.JSX.Element {
  return (
    <footer className={styles.footer} aria-labelledby="landing-footer-title" lang="en">
      <div className={styles.footerInner}>
        <h2 id="landing-footer-title" className={styles.footerTitle}>
          Ready to simplify your workflow?
        </h2>
        <p className={styles.footerText}>
          Join professional PV installers managing their technical documentation with SOLARIX PRO.
        </p>

        <div className={styles.footerActions}>
          <Link href="/login" className={`${styles.button} ${styles.buttonOutline}`}>
            Log in
          </Link>
          <Link href="/login?mode=signup" className={`${styles.button} ${styles.buttonPrimary}`}>
            Create account
          </Link>
        </div>

        <p className={styles.copyright}>
          &copy; {new Date().getFullYear()} SOLARIX PRO. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
