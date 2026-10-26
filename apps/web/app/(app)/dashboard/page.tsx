import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import {
  summarizeSubscription,
  projectsCountedThisMonth,
  quotaJobs,
  quotaWindowStart,
} from '../../../lib/subscription';
import { loadEffectiveSubscription } from '../../../lib/sponsorship';
import { PROJECT_STATUS_LABELS, TIER_LABELS } from '../../../lib/labels';
import { projectHref, projectStepLabel } from '../../../lib/project-list';
import { isAwaitingEmailConfirmation } from '../../../lib/email-confirmation';
import { SubscriptionBanner } from '../../../components/subscription-banner';
import { PremiumUpsell } from '../../../components/premium-upsell';
import { loadPremiumUpgrade } from '../../../lib/payments/upgrade';
import { StatsCard } from './stats-card';
import { Dashboard, Projects, ChartBar, KwHours, Add } from '@dossipv/icons';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const now = new Date();

  const subscription = summarizeSubscription(await loadEffectiveSubscription(user.companyId), now);
  const [jobsInWindow, recentProjects, projectCount] = await Promise.all([
    quotaJobs(user.companyId, subscription, now),
    db.project.findMany({
      where: { companyId: user.companyId, archivedAt: null },
      include: { client: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    db.project.count({ where: { companyId: user.companyId, archivedAt: null } }),
  ]);

  const awaitingEmail = subscription === null && (await isAwaitingEmailConfirmation(user.id));
  const used = projectsCountedThisMonth(jobsInWindow, now, quotaWindowStart(subscription, now)).size;
  const premiumUpgrade = await loadPremiumUpgrade(subscription);

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dashboard size="lg" color="gold" />
        Bienvenue, {user.fullName}
      </h1>

      <SubscriptionBanner subscription={subscription} trialUsed={used} awaitingEmailConfirmation={awaitingEmail} />

      {premiumUpgrade && <PremiumUpsell upgrade={premiumUpgrade} />}

      <div className="card-grid" style={{ marginBottom: 16 }}>
        <StatsCard icon={Projects} label="Projets" value={projectCount} />
        <StatsCard
          icon={ChartBar}
          label={subscription?.isTrial ? 'Dossiers (essai)' : 'Dossiers ce mois'}
          value={subscription ? `${used} / ${subscription.monthlyDossierLimit}` : String(used)}
        />
        {subscription && (
          <StatsCard icon={KwHours} label="Abonnement" value={subscription.planName} />
        )}
      </div>

      <Card as="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Derniers projets</h2>
          <Link href="/projects/new" className={buttonVariants()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Add size="sm" color="inherit" />
            Nouveau projet
          </Link>
        </div>

        {recentProjects.length === 0 ? (
          <p className="text-app-muted">
            Aucun projet pour l&apos;instant. Créez votre premier projet pour commencer un dossier.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
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
                      <Link href={projectHref(project)}>
                        {project.client?.fullName ?? 'Sans client'}
                      </Link>
                    </td>
                    <td>
                      {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                      {projectStepLabel(project) && <span className="text-app-muted"> · {projectStepLabel(project)}</span>}
                    </td>
                    <td>{TIER_LABELS[project.tier] ?? project.tier}</td>
                    <td>{project.updatedAt.toLocaleDateString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
          <Link href="/projects" className={buttonVariants({ variant: 'secondary' })}>
            Tous les projets
          </Link>
        </div>
      </Card>
    </main>
  );
}
