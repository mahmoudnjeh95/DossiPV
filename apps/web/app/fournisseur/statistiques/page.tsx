import { buttonVariants } from '@/components/ui/button';
import { requireSupplier } from '../../../lib/supplier-access';
import Link from 'next/link';
import { loadProductMonthStats, loadSupplierStats, lastMonths } from '../../../lib/supplier-stats';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';

export default async function SupplierStatsPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }): Promise<React.JSX.Element> {
  const { mois } = await searchParams;
  const { supplierId } = await requireSupplier();
  const months = lastMonths();
  const month = months.find((m) => m.key === mois) ?? months[0]!;
  const [stats, monthStats] = await Promise.all([loadSupplierStats(supplierId), loadProductMonthStats(supplierId, month.start)]);
  const monthLabel = (start: Date): string => start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <main>
      <h1>Statistiques</h1>
      <p className="text-[0.8rem] font-normal text-app-muted">Chiffres agrégés uniquement : aucune donnée sur les clients de vos installateurs n’est affichée.</p>

      <Card as="section" className="overflow-x-auto">
        <h2>Dossiers ce mois-ci : {stats.totalDossiersThisMonth}</h2>
        {stats.installers.length === 0 ? (
          <p className="text-app-muted">Aucun installateur parrainé pour le moment.</p>
        ) : (
          <Table>
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
          </Table>
        )}
      </Card>

      <Card as="section" className="overflow-x-auto">
        <h2>Produits par mois : {monthLabel(month.start)}</h2>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Mois">
          {months.map((m) => (
            <Link key={m.key} href={`/fournisseur/statistiques?mois=${m.key}`} className={buttonVariants({ size: 'sm', variant: m.key === month.key ? 'default' : 'secondary' })}>
              {monthLabel(m.start)}
            </Link>
          ))}
        </nav>
        {monthStats.length === 0 ? (
          <p className="text-app-muted">Vous ne référencez encore aucun produit.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Produit</th>
                <th title="Nombre de fois où ce produit sponsorisé a été proposé à un installateur direct dans une proposition de matériel.">
                  Proposé (sponsorisé)
                </th>
                <th title="Nombre de fois où un installateur direct a choisi ce produit proposé et l’a appliqué à son projet.">Appliqué</th>
                <th>Dossiers générés</th>
                <th>kWc installés</th>
              </tr>
            </thead>
            <tbody>
              {monthStats.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.label} {p.highlighted && <Badge variant="ok">Sponsorisé</Badge>}
                  </td>
                  <td>{p.shown}</td>
                  <td>{p.applied}</td>
                  <td>{p.dossiers}</td>
                  <td>{p.kwc.toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="text-[0.8rem] font-normal text-app-muted">
          « Proposé » : le produit sponsorisé a été suggéré à un installateur direct dans une proposition de matériel. « Appliqué » : cet installateur l’a appliqué à son
          projet. Ces deux chiffres comptent les propositions sponsorisées faites aux installateurs directs, sans savoir lesquels. Les dossiers et
          les kWc ne concernent que vos installateurs parrainés.
        </p>
      </Card>

      <Card as="section" className="overflow-x-auto">
        <h2>Projets par produit</h2>
        {stats.products.length === 0 ? (
          <p className="text-app-muted">Vous ne référencez encore aucun produit.</p>
        ) : (
          <Table>
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
          </Table>
        )}
      </Card>
    </main>
  );
}
