import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import {
  summarizeSubscription,
  projectsCountedThisMonth,
  monthStart,
} from '../../../lib/subscription';
import { PROJECT_STATUS_LABELS, TIER_LABELS } from '../../../lib/labels';
import { SubscriptionBanner } from '../../../components/subscription-banner';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const now = new Date();

  const [company, jobsThisMonth, recentProjects, projectCount] = await Promise.all([
    db.company.findUnique({
      where: { id: user.companyId },
      include: { subscription: { include: { plan: true } } },
    }),
    db.dossierJob.findMany({
      where: { project: { companyId: user.companyId }, startedAt: { gte: monthStart(now) } },
      select: { projectId: true, status: true, startedAt: true },
    }),
    db.project.findMany({
      where: { companyId: user.companyId },
      include: { client: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    db.project.count({ where: { companyId: user.companyId } }),
  ]);

  const subscription = summarizeSubscription(company?.subscription ?? null, now);
  const used = projectsCountedThisMonth(jobsThisMonth, now).size;

  return (
    <main>
      <h1>Bienvenue, {user.fullName}</h1>
      <SubscriptionBanner subscription={subscription} />

      <div className="card-grid">
        <section className="card">
          <h2>Abonnement</h2>
          {subscription ? (
            <>
              <p className="stat">{subscription.planName}</p>
              <p className="muted">
                {TIER_LABELS[subscription.tier]} · jusqu&apos;au{' '}
                {subscription.periodEnd.toLocaleDateString('fr-FR')}
              </p>
            </>
          ) : (
            <p className="muted">Aucun abonnement actif.</p>
          )}
        </section>
        <section className="card">
          <h2>Dossiers ce mois</h2>
          <p className="stat">
            {used}
            {subscription ? ` / ${subscription.monthlyDossierLimit}` : ''}
          </p>
          <p className="muted">
            Un projet compte une seule fois, quel que soit le nombre de régénérations.
          </p>
        </section>
        <section className="card">
          <h2>Projets</h2>
          <p className="stat">{projectCount}</p>
          <p className="actions">
            <Link href="/projects/new" className="button">
              Nouveau projet
            </Link>
            <Link href="/projects" className="button secondary">
              Tous les projets
            </Link>
          </p>
        </section>
      </div>

      <section className="card">
        <h2>Derniers projets</h2>
        {recentProjects.length === 0 ? (
          <p className="muted">
            Aucun projet pour l&apos;instant. Créez votre premier projet pour commencer un dossier.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Statut</th>
                  <th>Offre</th>
                  <th>Modifié</th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <Link href={`/projects/${project.id}`}>
                        {project.client?.fullName ?? 'Sans client'}
                      </Link>
                    </td>
                    <td>{PROJECT_STATUS_LABELS[project.status] ?? project.status}</td>
                    <td>{TIER_LABELS[project.tier] ?? project.tier}</td>
                    <td>{project.updatedAt.toLocaleDateString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
