import { requireSupplier } from '../../../lib/supplier-access';
import { loadSupplierStats } from '../../../lib/supplier-stats';

export default async function SupplierStatsPage(): Promise<React.JSX.Element> {
  const { supplierId } = await requireSupplier();
  const stats = await loadSupplierStats(supplierId);

  return (
    <main>
      <h1>Statistiques</h1>
      <p className="hint">Chiffres agrégés uniquement : aucune donnée sur les clients de vos installateurs n’est affichée.</p>

      <section className="card table-wrap">
        <h2>Dossiers ce mois-ci : {stats.totalDossiersThisMonth}</h2>
        {stats.installers.length === 0 ? (
          <p className="muted">Aucun installateur parrainé pour le moment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Installateur</th>
                <th>Dossiers</th>
              </tr>
            </thead>
            <tbody>
              {stats.installers.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.dossiersThisMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card table-wrap">
        <h2>Projets par produit</h2>
        {stats.products.length === 0 ? (
          <p className="muted">Vous ne référencez encore aucun produit.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Produit</th>
                <th>Type</th>
                <th>Projets de vos installateurs</th>
              </tr>
            </thead>
            <tbody>
              {stats.products.map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td>{p.kind === 'PV_MODULE' ? 'Panneau' : 'Onduleur'}</td>
                  <td>{p.projects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
