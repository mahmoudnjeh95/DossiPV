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
import { StatsCard } from './stats-card';
import { Dashboard, Projects, ChartBar, KwHours, Add } from '@dossipv/icons';

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
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dashboard size="lg" color="gold" />
        Bienvenue, {user.fullName}
      </h1>

      <SubscriptionBanner subscription={subscription} />

      <div className="card-grid" style={{ marginBottom: 16 }}>
        <StatsCard icon={Projects} label="Projets" value={projectCount} />
        <StatsCard
          icon={ChartBar}
          label="Dossiers ce mois"
          value={subscription ? `${used} / ${subscription.monthlyDossierLimit}` : String(used)}
        />
        {subscription && (
          <StatsCard icon={KwHours} label="Abonnement" value={subscription.planName} />
        )}
      </div>

      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Derniers projets</h2>
          <Link href="/projects/new" className="button" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Add size="sm" color="inherit" />
            Nouveau projet
          </Link>
        </div>

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

        <div className="actions" style={{ marginTop: 12 }}>
          <Link href="/projects" className="button secondary">
            Tous les projets
          </Link>
        </div>
      </section>
    </main>
  );
}
