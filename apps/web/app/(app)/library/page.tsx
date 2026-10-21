import Link from 'next/link';
import { requireAuthenticatedCompanyUser } from '../layout';
import { loadSections } from './library-data';
import { LibraryTabs } from './library-tabs';
import { AddAllButton, AddButton, RemoveButton } from './library-buttons';
import { PriceForm } from './price-form';

type SearchParams = Promise<{ tab?: string; q?: string }>;
type BulkKind = 'SPD' | 'DC_SWITCH' | 'DC_FUSE' | 'AC_BREAKER' | 'AC_ISOLATOR' | 'CABLE';

/**
 * The installer's own equipment library: each company picks, from the shared catalog, the
 * equipment it installs; only that equipment is offered in its projects.
 */
export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const params = await searchParams;
  const catalogue = params.tab === 'catalogue';
  const q = (params.q ?? '').slice(0, 100);
  const sections = await loadSections(user.companyId, catalogue ? 'catalogue' : 'library', catalogue ? q : '');
  const total = sections.reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <main>
      <h1>Ma bibliothèque</h1>
      <LibraryTabs active={catalogue ? 'catalogue' : 'mine'} />

      {catalogue && (
        <form method="get" className="card">
          <input type="hidden" name="tab" value="catalogue" />
          <label>
            Rechercher
            <input type="search" name="q" defaultValue={q} placeholder="Marque, modèle, puissance (W ou kW)" />
          </label>
          <button type="submit">Rechercher</button>
        </form>
      )}

      {!catalogue && total === 0 && (
        <section className="card">
          <p>Votre bibliothèque est vide : ajoutez les équipements que vous installez depuis le catalogue partagé.</p>
          <Link href="/library?tab=catalogue">Ouvrir le catalogue partagé</Link>
        </section>
      )}

      {sections
        .filter((s) => s.rows.length > 0)
        .map((s) => (
          <section key={s.kind} className="card table-wrap">
            <h2>
              {s.title} ({s.rows.length})
            </h2>
            {catalogue && s.bulk && s.rows.some((r) => !r.libraryItemId) && <AddAllButton kind={s.kind as BulkKind} />}
            <table>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.itemId}>
                    <td>{r.label}</td>
                    <td>{r.figures}</td>
                    {catalogue ? (
                      <td>
                        {r.libraryItemId ? (
                          <span className="badge badge-ok">Déjà ajouté</span>
                        ) : (
                          <AddButton kind={s.kind} itemId={r.itemId} />
                        )}
                      </td>
                    ) : (
                      <>
                        <td>{r.libraryItemId && <PriceForm libraryItemId={r.libraryItemId} priceTnd={r.priceTnd} />}</td>
                        <td>{r.libraryItemId && <RemoveButton libraryItemId={r.libraryItemId} />}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

      {catalogue && total === 0 && <p className="muted">Aucun équipement ne correspond à votre recherche.</p>}
    </main>
  );
}
