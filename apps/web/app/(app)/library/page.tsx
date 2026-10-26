import Link from 'next/link';
import { requireAuthenticatedCompanyUser } from '../layout';
import { loadSections, withHighlights } from './library-data';
import { loadHighlightedProducts } from '../../../lib/highlight';
import { SponsoredBadge } from '../../../components/sponsored-badge';
import { LibraryTabs } from './library-tabs';
import { AddAllButton, AddButton, DeleteOwnButton, RemoveAllButton, RemoveButton } from './library-buttons';
import { ownEquipmentSlug } from './own-equipment-kinds';
import { PriceForm } from './price-form';
import { loadSponsor } from '../../../lib/sponsor-info';
import type { EquipmentKind } from '@dossipv/db';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table } from '@/components/ui/table';

const SECTION_FILTERS: { kind: EquipmentKind; label: string }[] = [
  { kind: 'PV_MODULE', label: 'Modules photovoltaïques' },
  { kind: 'INVERTER', label: 'Onduleurs' },
  { kind: 'SPD', label: 'Parafoudres' },
  { kind: 'DC_SWITCH', label: 'Interrupteurs-sectionneurs DC' },
  { kind: 'DC_FUSE', label: 'Fusibles DC' },
  { kind: 'AC_BREAKER', label: 'Disjoncteurs AC' },
  { kind: 'AC_ISOLATOR', label: 'Interrupteurs-sectionneurs AC' },
  { kind: 'CABLE', label: 'Câbles' },
  { kind: 'ACCESSORY', label: 'Accessoires' },
];


type SearchParams = Promise<{ tab?: string; q?: string; type?: string; more?: string }>;

/** Rows shown per section before « Afficher plus » (the shared catalogue lists hundreds of items). */
const PAGE_SIZE = 25;
type BulkKind = 'SPD' | 'DC_SWITCH' | 'DC_FUSE' | 'AC_BREAKER' | 'AC_ISOLATOR' | 'CABLE';

function moreHref(q: string, type: EquipmentKind | null, more: number): string {
  const query = new URLSearchParams({ tab: 'catalogue', more: String(more) });
  if (q) query.set('q', q);
  if (type) query.set('type', type);
  return `/library?${query.toString()}`;
}

/**
 * The installer's own equipment library: each company picks, from the shared catalog, the
 * equipment it installs, or adds its own (see /library/new); only that equipment is offered in
 * its projects.
 */
export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const params = await searchParams;
  const sponsor = await loadSponsor(user.companyId);
  const sponsored = sponsor !== null;
  // A sponsored installer's library is managed by its supplier: no shared catalog to pick from.
  const catalogue = params.tab === 'catalogue' && !sponsored;
  const q = (params.q ?? '').slice(0, 100);
  const typeFilter = catalogue ? (SECTION_FILTERS.find((f) => f.kind === params.type)?.kind ?? null) : null;
  const shown = Math.min(Math.max(Number.parseInt(params.more ?? '', 10) || 1, 1), 40) * PAGE_SIZE;
  const allSections = await loadSections(user.companyId, catalogue ? 'catalogue' : 'library', catalogue ? q : '', typeFilter);
  // Highlighted panels and inverters come first in the shared catalog (direct installers only).
  const sections = catalogue ? withHighlights(allSections, await loadHighlightedProducts()) : allSections;
  const total = sections.reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <main>
      <h1>Ma bibliothèque</h1>
      <LibraryTabs active={catalogue ? 'catalogue' : 'mine'} sponsored={sponsored} />
      {sponsor && (
        <Alert variant="ok" role="status">
          Bibliothèque gérée par {sponsor.name} : ses panneaux et onduleurs, et les protections et câbles du catalogue partagé.
        </Alert>
      )}

      {catalogue && (
        <Card as="form" method="get">
          <Input type="hidden" name="tab" value="catalogue" />
          <Label>
            Rechercher
            <Input type="search" name="q" defaultValue={q} placeholder="Marque, modèle, puissance (550 W, 5 kW), « onduleur », « parafoudre »…" />
          </Label>
          <Label>
            Type
            <Select name="type" defaultValue={typeFilter ?? ''}>
              <option value="">Tous les types</option>
              {SECTION_FILTERS.map((f) => (
                <option key={f.kind} value={f.kind}>{f.label}</option>
              ))}
            </Select>
          </Label>
          <Button type="submit">Rechercher</Button>
        </Card>
      )}

      {!catalogue && total === 0 && !sponsored && (
        <Card as="section">
          <p>Votre bibliothèque est vide : ajoutez les équipements que vous installez depuis le catalogue partagé, ou saisissez votre propre matériel.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/library?tab=catalogue">Ouvrir le catalogue partagé</Link>
            <Link href="/library/new">Ajouter mon matériel</Link>
          </div>
        </Card>
      )}

      {sections
        .filter((s) => s.rows.length > 0)
        .map((s) => (
          <Card as="section" key={s.kind} className="overflow-x-auto">
            <h2>
              {s.title} ({s.rows.length})
            </h2>
            {catalogue && s.bulk && s.rows.some((r) => !r.libraryItemId) && <AddAllButton kind={s.kind as BulkKind} />}
            {!catalogue && s.rows.length > 1 && !sponsored && (
              <RemoveAllButton kind={s.kind} count={s.rows.length} title={s.title} />
            )}
            <Table>
              <tbody>
                {s.rows.slice(0, catalogue ? shown : undefined).map((r) => (
                  <tr key={r.itemId}>
                    <td>
                      {r.label} {r.own && <Badge>Mon matériel</Badge>}
                      {r.sponsoredBy && <SponsoredBadge suppliers={r.sponsoredBy} />}
                    </td>
                    <td>{r.figures}</td>
                    {catalogue ? (
                      <td>
                        {r.libraryItemId ? (
                          <Badge variant="ok">Déjà ajouté</Badge>
                        ) : (
                          <AddButton kind={s.kind} itemId={r.itemId} />
                        )}
                      </td>
                    ) : (
                      <>
                        <td>{r.libraryItemId && <PriceForm libraryItemId={r.libraryItemId} priceTnd={r.priceTnd} />}</td>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            {r.own && <Link href={`/library/edit/${ownEquipmentSlug(s.kind)}/${r.itemId}`}>Modifier</Link>}
                            {r.libraryItemId && !sponsored && <RemoveButton libraryItemId={r.libraryItemId} />}
                            {r.own && <DeleteOwnButton kind={s.kind} itemId={r.itemId} />}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            {catalogue && s.rows.length > shown && (
              <p>
                <Link href={moreHref(q, typeFilter, shown / PAGE_SIZE + 1)}>
                  Afficher plus ({s.rows.length - shown} autres {s.title.toLowerCase()})
                </Link>
              </p>
            )}
          </Card>
        ))}

      {catalogue && total === 0 && <p className="text-app-muted">Aucun équipement ne correspond à votre recherche.</p>}
    </main>
  );
}
