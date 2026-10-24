import Link from 'next/link';
import { requireAuthenticatedCompanyUser } from '../layout';
import { loadSections } from './library-data';
import { LibraryTabs } from './library-tabs';
import { AddAllButton, AddButton, DeleteOwnButton, RemoveButton } from './library-buttons';
import { ownEquipmentSlug } from './own-equipment-kinds';
import { PriceForm } from './price-form';
import { loadSponsor } from '../../../lib/sponsor-info';
import { LOCKED_KINDS } from '../../../lib/sponsorship';

const isLocked = (kind: string): boolean => (LOCKED_KINDS as readonly string[]).includes(kind);

type SearchParams = Promise<{ tab?: string; q?: string }>;
type BulkKind = 'SPD' | 'DC_SWITCH' | 'DC_FUSE' | 'AC_BREAKER' | 'AC_ISOLATOR' | 'CABLE';

/**
 * The installer's own equipment library: each company picks, from the shared catalog, the
 * equipment it installs, or adds its own (see /library/new); only that equipment is offered in
 * its projects.
 */
export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const params = await searchParams;
  const catalogue = params.tab === 'catalogue';
  const q = (params.q ?? '').slice(0, 100);
  const [allSections, sponsor] = await Promise.all([
    loadSections(user.companyId, catalogue ? 'catalogue' : 'library', catalogue ? q : ''),
    loadSponsor(user.companyId),
  ]);
  const sponsored = sponsor !== null;
  // A sponsored installer cannot add panels or inverters: they are not offered from the shared catalog.
  const sections = sponsored && catalogue ? allSections.filter((s) => !isLocked(s.kind)) : allSections;
  const total = sections.reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <main>
      <h1>Ma bibliothèque</h1>
      <LibraryTabs active={catalogue ? 'catalogue' : 'mine'} sponsored={sponsored} />
      {sponsor && (
        <p className="banner banner-ok" role="status">
          Panneaux et onduleurs fournis par {sponsor.name}
        </p>
      )}

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
          <p>
            Votre bibliothèque est vide : ajoutez les équipements que vous installez depuis le catalogue partagé
            {sponsored ? '.' : ', ou saisissez votre propre matériel.'}
          </p>
          <div className="actions">
            <Link href="/library?tab=catalogue">Ouvrir le catalogue partagé</Link>
            {!sponsored && <Link href="/library/new">Ajouter mon matériel</Link>}
          </div>
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
                    <td>
                      {r.label} {r.own && <span className="badge">Mon matériel</span>}
                    </td>
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
                        <td>
                          <div className="actions">
                            {r.own && <Link href={`/library/edit/${ownEquipmentSlug(s.kind)}/${r.itemId}`}>Modifier</Link>}
                            {r.libraryItemId && !(sponsored && isLocked(s.kind)) && <RemoveButton libraryItemId={r.libraryItemId} />}
                            {r.own && <DeleteOwnButton kind={s.kind} itemId={r.itemId} />}
                          </div>
                        </td>
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
