import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireSupplier } from '../../../lib/supplier-access';
import { ActionButton } from '../action-button';
import { highlightEligibility, MAX_HIGHLIGHTED_PRODUCTS } from '../../../lib/supplier-highlight';
import { addSupplierProductAction, removeSupplierProductAction, setProductHighlightedAction } from './actions';

const CATALOG_LIMIT = 50;

type TypeFilter = 'tous' | 'panneaux' | 'onduleurs';

const TYPE_FILTERS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'tous', label: 'Tous' },
  { key: 'panneaux', label: 'Panneaux' },
  { key: 'onduleurs', label: 'Onduleurs' },
];

/** The catalog window: the first page, then 50 more per « Afficher plus » (n is the number shown per type), capped to stay sane. */
function readLimit(n: string | undefined): number {
  const value = Number(n);
  if (!Number.isFinite(value) || value < CATALOG_LIMIT) return CATALOG_LIMIT;
  return Math.min(Math.floor(value), 1000);
}

function catalogHref(type: TypeFilter, search: string, limit: number): string {
  const params = new URLSearchParams();
  if (type !== 'tous') params.set('type', type);
  if (search) params.set('q', search);
  if (limit > CATALOG_LIMIT) params.set('n', String(limit));
  const query = params.toString();
  return query ? `/fournisseur/produits?${query}` : '/fournisseur/produits';
}

export default async function SupplierProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; proposed?: string; type?: string; n?: string }>;
}): Promise<React.JSX.Element> {
  const { q, proposed, type: typeParam, n } = await searchParams;
  const { supplierId } = await requireSupplier();
  const search = (q ?? '').trim();
  const type: TypeFilter = typeParam === 'panneaux' || typeParam === 'onduleurs' ? typeParam : 'tous';
  const limit = readLimit(n);
  const eligibility = await highlightEligibility(supplierId);

  const carried = await db.supplierProduct.findMany({
    where: { supplierCompanyId: supplierId },
    orderBy: { createdAt: 'asc' },
    include: {
      pvModule: { select: { id: true, brand: true, model: true, pmaxW: true, catalogStatus: true } },
      inverter: { select: { id: true, brand: true, model: true, pacW: true, catalogStatus: true } },
    },
  });
  const carriedModuleIds = carried.flatMap((p) => (p.pvModuleId ? [p.pvModuleId] : []));
  const carriedInverterIds = carried.flatMap((p) => (p.inverterId ? [p.inverterId] : []));

  // Only published, sourced shared items can be carried; the catalog search hides what is already carried.
  const match = search ? { OR: [{ brand: { contains: search, mode: 'insensitive' as const } }, { model: { contains: search, mode: 'insensitive' as const } }] } : {};
  const shared = { ownerCompanyId: null, catalogStatus: 'PUBLISHED' as const, datasheetSourceUrl: { not: null } };
  // One extra row per type tells whether « Afficher plus » has anything to show.
  const [modulesPlusOne, invertersPlusOne] = await Promise.all([
    type === 'onduleurs' ? Promise.resolve([]) : db.pvModule.findMany({ where: { ...shared, ...match, id: { notIn: carriedModuleIds } }, orderBy: [{ brand: 'asc' }, { model: 'asc' }], take: limit + 1, select: { id: true, brand: true, model: true, pmaxW: true } }),
    type === 'panneaux' ? Promise.resolve([]) : db.inverter.findMany({ where: { ...shared, ...match, id: { notIn: carriedInverterIds } }, orderBy: [{ brand: 'asc' }, { model: 'asc' }], take: limit + 1, select: { id: true, brand: true, model: true, pacW: true } }),
  ]);
  const modules = modulesPlusOne.slice(0, limit);
  const inverters = invertersPlusOne.slice(0, limit);
  const hasMore = modulesPlusOne.length > limit || invertersPlusOne.length > limit;

  return (
    <main>
      <h1>Produits</h1>
      <p className="hint">
        Les installateurs que vous parrainez ne peuvent utiliser que ces panneaux et onduleurs. Seuls les produits publiés dans le
        catalogue SolarixPro, avec leur fiche technique sourcée, leur sont ouverts : un produit proposé reste en attente jusqu’à sa
        validation. Pensez à l’homologation ANME des produits que vous référencez.
      </p>
      <p className="hint">
        La mise en avant (réservée aux packs qui l’incluent) place vos produits publiés en tête des catalogues et des propositions des
        installateurs directs, avec la mention « Sponsorisé » ({MAX_HIGHLIGHTED_PRODUCTS} produits au maximum). Elle ne change rien à la
        bibliothèque de vos installateurs parrainés.
      </p>
      <details className="hint">
        <summary>Que signifient « Sponsorisé » et « Mettre en avant » ?</summary>
        <p>
          <strong>Mettre en avant</strong> : vous demandez que l’un de vos produits publiés soit suggéré en priorité aux installateurs directs
          (ceux qui n’ont pas de fournisseur). <strong>Sponsorisé</strong> : mention affichée sur un produit actuellement mis en avant.
          Les statistiques comptent ensuite combien de fois il a été <strong>proposé</strong> (suggéré dans une proposition de matériel) et
          combien de fois <strong>appliqué</strong> (choisi par l’installateur pour son projet).
        </p>
      </details>
      {carried.length === 0 && (
        <section className="card" aria-label="Bienvenue">
          <h2>Bienvenue dans votre espace fournisseur</h2>
          <p>Pour démarrer, suivez ces 4 étapes :</p>
          <ol>
            <li>
              <strong>Produits</strong> : référencez vos panneaux et onduleurs (depuis le catalogue ci-dessous, ou proposez-en un nouveau).
            </li>
            <li>
              <strong>Installateurs</strong> : <Link href="/fournisseur/installateurs">invitez vos installateurs</Link> par e-mail ; ils utiliseront
              votre matériel.
            </li>
            <li>
              <strong>Abonnement</strong> : vérifiez votre pack et votre paiement dans{' '}
              <Link href="/fournisseur/facturation">Abonnement et paiement</Link>.
            </li>
            <li>
              <strong>Statistiques</strong> : suivez l’activité de vos installateurs dans <Link href="/fournisseur/statistiques">Statistiques</Link>.
            </li>
          </ol>
        </section>
      )}
      {proposed && <div className="banner banner-ok">Produit proposé : il sera disponible pour vos installateurs dès sa validation par SolarixPro.</div>}

      <section className="card table-wrap">
        <h2>Mes produits ({carried.length})</h2>
        {carried.length === 0 ? (
          <p className="muted">Vous ne référencez encore aucun produit.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Marque et modèle</th>
                <th>Puissance</th>
                <th>Statut</th>
                <th title="Mettre en avant : suggérer ce produit en priorité aux installateurs directs. « Sponsorisé » indique un produit actuellement mis en avant.">Mise en avant</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {carried.map((p) => {
                const item = p.pvModule ?? p.inverter;
                if (!item) return null;
                const power = p.pvModule ? `${p.pvModule.pmaxW} Wc` : p.inverter ? `${p.inverter.pacW} W` : '';
                return (
                  <tr key={p.id}>
                    <td>{p.kind === 'PV_MODULE' ? 'Panneau' : 'Onduleur'}</td>
                    <td>
                      {item.brand} {item.model}
                    </td>
                    <td>{power}</td>
                    <td>
                      {item.catalogStatus === 'PUBLISHED' ? <span className="badge badge-ok">Publié</span> : <span className="badge">En attente de validation</span>}
                    </td>
                    <td>
                      {p.highlighted && <span className="badge badge-ok" title="Ce produit est mis en avant : il est suggéré en priorité aux installateurs directs.">Sponsorisé</span>}
                      {item.catalogStatus !== 'PUBLISHED' ? (
                        <span className="muted">en attente de validation</span>
                      ) : (
                        <>
                          <ActionButton
                            action={setProductHighlightedAction.bind(null, p.id, !p.highlighted)}
                            label={p.highlighted ? 'Retirer la mise en avant' : 'Mettre en avant'}
                            secondary={p.highlighted}
                            disabled={!p.highlighted && !eligibility.ok}
                          />
                          {!p.highlighted && !eligibility.ok && <span className="muted">{eligibility.reason}</span>}
                        </>
                      )}
                    </td>
                    <td>
                      <ActionButton action={removeSupplierProductAction.bind(null, p.id)} label="Retirer" secondary confirmMessage="Retirer ce produit ? Vos installateurs parrainés ne pourront plus l’utiliser." />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card table-wrap">
        <h2>Ajouter depuis le catalogue</h2>
        <nav className="actions" aria-label="Type de produit">
          {TYPE_FILTERS.map((t) => (
            <Link key={t.key} href={catalogHref(t.key, search, CATALOG_LIMIT)} className={t.key === type ? 'button small' : 'button secondary small'} aria-current={t.key === type ? 'true' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <form method="get" className="actions">
          {type !== 'tous' && <input type="hidden" name="type" value={type} />}
          <input type="search" name="q" defaultValue={search} placeholder="Marque ou modèle" aria-label="Marque ou modèle" />
          <button type="submit">Rechercher</button>
        </form>
        {modules.length + inverters.length === 0 ? (
          <p className="muted">Aucun produit du catalogue ne correspond.</p>
        ) : (
          <table>
            <tbody>
              {modules.map((m) => (
                <tr key={`m-${m.id}`}>
                  <td>Panneau</td>
                  <td>
                    {m.brand} {m.model}
                  </td>
                  <td>{m.pmaxW} Wc</td>
                  <td>
                    <ActionButton action={addSupplierProductAction.bind(null, 'PV_MODULE', m.id)} label="Ajouter" />
                  </td>
                </tr>
              ))}
              {inverters.map((i) => (
                <tr key={`i-${i.id}`}>
                  <td>Onduleur</td>
                  <td>
                    {i.brand} {i.model}
                  </td>
                  <td>{i.pacW} W</td>
                  <td>
                    <ActionButton action={addSupplierProductAction.bind(null, 'INVERTER', i.id)} label="Ajouter" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {hasMore ? (
          <p>
            <Link href={catalogHref(type, search, limit + CATALOG_LIMIT)} className="button secondary">
              Afficher plus
            </Link>
          </p>
        ) : null}
        <p className="hint">
          {modules.length + inverters.length} produit(s) affiché(s){hasMore ? ' : affichez-en plus ou affinez la recherche.' : '.'}
        </p>
      </section>

      <section className="card">
        <h2>Proposer un nouveau produit</h2>
        <p className="hint">Il n’est pas dans le catalogue ? Saisissez sa fiche technique : SolarixPro la vérifie avant de la publier.</p>
        <div className="actions">
          <Link href="/fournisseur/produits/proposer/PV_MODULE" className="button secondary">
            Proposer un panneau
          </Link>
          <Link href="/fournisseur/produits/proposer/INVERTER" className="button secondary">
            Proposer un onduleur
          </Link>
        </div>
      </section>
    </main>
  );
}
