import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireSupplier } from '../../../lib/supplier-access';
import { ActionButton } from '../action-button';
import { addSupplierProductAction, removeSupplierProductAction } from './actions';

const CATALOG_LIMIT = 50;

export default async function SupplierProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; proposed?: string }>;
}): Promise<React.JSX.Element> {
  const { q, proposed } = await searchParams;
  const { supplierId } = await requireSupplier();
  const search = (q ?? '').trim();

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
  const [modules, inverters] = await Promise.all([
    db.pvModule.findMany({ where: { ...shared, ...match, id: { notIn: carriedModuleIds } }, orderBy: [{ brand: 'asc' }, { model: 'asc' }], take: CATALOG_LIMIT, select: { id: true, brand: true, model: true, pmaxW: true } }),
    db.inverter.findMany({ where: { ...shared, ...match, id: { notIn: carriedInverterIds } }, orderBy: [{ brand: 'asc' }, { model: 'asc' }], take: CATALOG_LIMIT, select: { id: true, brand: true, model: true, pacW: true } }),
  ]);

  return (
    <main>
      <h1>Produits</h1>
      <p className="hint">
        Les installateurs que vous parrainez ne peuvent utiliser que ces panneaux et onduleurs. Seuls les produits publiés dans le
        catalogue DossiPV, avec leur fiche technique sourcée, leur sont ouverts : un produit proposé reste en attente jusqu’à sa
        validation. Pensez à l’homologation ANME des produits que vous référencez.
      </p>
      {proposed && <div className="banner banner-ok">Produit proposé : il sera disponible pour vos installateurs dès sa validation par DossiPV.</div>}

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
        <form method="get" className="actions">
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
        <p className="hint">Les {CATALOG_LIMIT} premiers résultats de chaque type sont affichés : affinez la recherche si besoin.</p>
      </section>

      <section className="card">
        <h2>Proposer un nouveau produit</h2>
        <p className="hint">Il n’est pas dans le catalogue ? Saisissez sa fiche technique : DossiPV la vérifie avant de la publier.</p>
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
