import Link from 'next/link';

export type LibraryTab = 'mine' | 'catalogue';

export function LibraryTabs({ active }: { active: LibraryTab }): React.JSX.Element {
  return (
    <nav aria-label="Bibliothèque" style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
      <Link
        href="/library"
        aria-current={active === 'mine' ? 'page' : undefined}
        style={{ fontWeight: active === 'mine' ? 700 : 400 }}
      >
        Mes équipements
      </Link>
      <Link
        href="/library?tab=catalogue"
        aria-current={active === 'catalogue' ? 'page' : undefined}
        style={{ fontWeight: active === 'catalogue' ? 700 : 400 }}
      >
        Catalogue partagé
      </Link>
    </nav>
  );
}
