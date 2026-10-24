import Link from 'next/link';

export type LibraryTab = 'mine' | 'catalogue' | 'new';

export function LibraryTabs({ active, sponsored = false }: { active: LibraryTab; sponsored?: boolean }): React.JSX.Element {
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
      {!sponsored && (
        <Link
          href="/library/new"
          aria-current={active === 'new' ? 'page' : undefined}
          style={{ fontWeight: active === 'new' ? 700 : 400 }}
        >
          Ajouter mon matériel
        </Link>
      )}
    </nav>
  );
}
