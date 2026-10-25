import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { PROJECT_STATUS_LABELS, TIER_LABELS, JOB_STATUS_LABELS } from '../../../lib/labels';
import { Projects, Add } from '@dossipv/icons';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';

export default async function ProjectListPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();

  const projects = await db.project.findMany({
    where: { companyId: user.companyId },
    include: { client: true, jobs: { orderBy: { startedAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <main>
      <div className="flex flex-wrap items-center gap-2" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Projects size="lg" color="gold" />
          Projets
        </h1>
        <Link href="/projects/new" className={buttonVariants()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Add size="sm" color="inherit" />
          Nouveau projet
        </Link>
      </div>
      {projects.length === 0 ? (
        <Card as="section">
          <p className="text-app-muted">
            Aucun projet. Créez votre premier projet pour commencer un dossier.
          </p>
        </Card>
      ) : (
        <Card as="section" className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <th>Client</th>
                <th>N° dossier</th>
                <th>Statut</th>
                <th>Offre</th>
                <th>Dernière génération</th>
                <th>Modifié</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const lastJob = project.jobs[0];
                return (
                  <tr key={project.id}>
                    <td>
                      <Link href={`/projects/${project.id}`}>
                        {project.client?.fullName ?? 'Sans client'}
                      </Link>
                    </td>
                    <td>{project.dossierNumber ?? '—'}</td>
                    <td>{PROJECT_STATUS_LABELS[project.status] ?? project.status}</td>
                    <td>{TIER_LABELS[project.tier] ?? project.tier}</td>
                    <td>
                      {lastJob
                        ? `${JOB_STATUS_LABELS[lastJob.status] ?? lastJob.status} · ${lastJob.startedAt.toLocaleDateString('fr-FR')}`
                        : '—'}
                    </td>
                    <td>{project.updatedAt.toLocaleDateString('fr-FR')}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </main>
  );
}
