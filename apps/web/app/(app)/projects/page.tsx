import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { PROJECT_STATUS_LABELS, TIER_LABELS, JOB_STATUS_LABELS } from '../../../lib/labels';
import {
  PROJECT_FILTER_STATUSES,
  PROJECT_FILTER_VIEWS,
  parseProjectFilters,
  projectHref,
  projectListWhere,
  projectStepLabel,
} from '../../../lib/project-list';
import { ProjectRowActions } from './project-row-actions';
import { Projects, Add } from '@dossipv/icons';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table } from '@/components/ui/table';

export default async function ProjectListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const filters = parseProjectFilters(await searchParams);
  const filtered = filters.q !== '' || filters.status !== null || filters.view !== 'active';

  const [projects, totalCount] = await Promise.all([
    db.project.findMany({
      where: projectListWhere(user.companyId, filters),
      include: { client: true, jobs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    }),
    db.project.count({ where: { companyId: user.companyId } }),
  ]);

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
      {totalCount === 0 ? (
        <Card as="section">
          <p className="text-app-muted">
            Aucun projet. Créez votre premier projet pour commencer un dossier.
          </p>
        </Card>
      ) : (
        <>
          <Card as="section">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <Label className="min-w-[14rem] grow">
                Rechercher
                <Input type="search" name="q" defaultValue={filters.q} placeholder="Client, réf. STEG, ville, n° dossier" />
              </Label>
              <Label>
                Statut
                <Select name="status" defaultValue={filters.status ?? ''}>
                  <option value="">Tous</option>
                  {PROJECT_FILTER_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label>
                Affichage
                <Select name="view" defaultValue={filters.view}>
                  {PROJECT_FILTER_VIEWS.map((view) => (
                    <option key={view.value} value={view.value}>
                      {view.label}
                    </option>
                  ))}
                </Select>
              </Label>
              <Button type="submit">Filtrer</Button>
              {filtered && (
                <Link href="/projects" className={buttonVariants({ variant: 'secondary' })}>
                  Réinitialiser
                </Link>
              )}
            </form>
          </Card>
          {projects.length === 0 ? (
            <Card as="section">
              <p className="text-app-muted">Aucun projet ne correspond à ces filtres.</p>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const lastJob = project.jobs[0];
                    const clientName = project.client?.fullName ?? 'Sans client';
                    const step = projectStepLabel(project);
                    return (
                      <tr key={project.id}>
                        <td>
                          <Link href={projectHref(project)}>{clientName}</Link>
                          {project.archivedAt && <> <Badge>Archivé</Badge></>}
                        </td>
                        <td>{project.dossierNumber ?? '—'}</td>
                        <td>
                          {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                          {step && <span className="text-app-muted"> · {step}</span>}
                        </td>
                        <td>{TIER_LABELS[project.tier] ?? project.tier}</td>
                        <td>
                          {lastJob
                            ? `${JOB_STATUS_LABELS[lastJob.status] ?? lastJob.status} · ${lastJob.startedAt.toLocaleDateString('fr-FR')}`
                            : '—'}
                        </td>
                        <td>{project.updatedAt.toLocaleDateString('fr-FR')}</td>
                        <td>
                          <ProjectRowActions
                            projectId={project.id}
                            clientName={clientName}
                            archived={project.archivedAt !== null}
                            deletable={!lastJob}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
