import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';
import { PLACEHOLDER } from '../lib/legal';

const LEGAL_LINKS = [
  { href: '/cgu', label: 'Conditions générales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/mentions-legales', label: 'Mentions légales' },
] as const;

/** The public layout of /cgu, /confidentialite and /mentions-legales: a readable text column. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }): React.JSX.Element {
  return (
    <main className="m-0 min-h-svh max-w-none bg-app-bg p-0">
      <header className="flex items-center justify-between border-b border-app-border bg-app-surface px-(--gutter) py-3">
        <Link href="/" aria-label="SolarixPro, accueil" className="no-underline">
          <BrandMark compact />
        </Link>
        <Link href="/login" className="text-[0.9rem] font-semibold text-app-accent no-underline">
          Se connecter
        </Link>
      </header>
      <article
        className={[
          'mx-auto max-w-[760px] px-(--gutter) py-12 text-[0.97rem] leading-[1.7] text-app-text',
          '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[1.25rem] [&_h2]:text-app-navy',
          '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[1.02rem] [&_h3]:text-app-navy',
          '[&_p]:my-3 [&_ul]:my-3 [&_ul]:pl-6 [&_li]:my-1 [&_ul]:list-disc',
          '[&_a]:font-semibold [&_a]:text-app-accent',
          '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.9rem]',
          '[&_th]:border [&_th]:border-app-border [&_th]:bg-app-surface [&_th]:p-2 [&_th]:text-left',
          '[&_td]:border [&_td]:border-app-border [&_td]:p-2 [&_td]:align-top',
        ].join(' ')}
      >
        <h1 className="m-0 text-[clamp(1.8rem,4vw,2.4rem)] leading-tight tracking-[-0.02em] text-app-navy">{title}</h1>
        <p className="mt-2 text-[0.85rem] text-app-muted">Version du {updated}</p>
        {children}
      </article>
      <footer className="border-t border-app-border px-(--gutter) py-6 text-center text-[0.85rem] text-app-muted">
        <nav aria-label="Informations légales" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-app-muted">
              {link.label}
            </Link>
          ))}
        </nav>
      </footer>
    </main>
  );
}

/** A publisher detail (getLegalEntity), highlighted while it is still missing so it cannot go unnoticed. */
export function LegalValue({ value }: { value: string | null }): React.JSX.Element {
  if (value) return <>{value}</>;
  return <mark className="rounded bg-app-warn-bg px-1 text-app-text">[{PLACEHOLDER}]</mark>;
}

/** "26 octobre 2026" from TERMS_VERSION. */
export function formatTermsDate(version: string): string {
  return new Date(`${version}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Tunis' });
}
