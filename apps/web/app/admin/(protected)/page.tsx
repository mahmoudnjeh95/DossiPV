import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from './layout';
import { AdminStatsCard } from './components/admin-stats-card';
import Link from 'next/link';
import { countSignupsToContact } from '../../../lib/admin-signups';
import { Users, ChartBar, Revenue, Payment } from '@dossipv/icons';

export function getMonthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export interface DashboardStats {
  activeInstallers: number;
  dossiersThisMonth: number;
  claudeCostThisMonthUsd: number;
  totalRevenueTnd: number;
}

export async function computeDashboardStats(now: Date): Promise<DashboardStats> {
  const monthStart = getMonthStart(now);

  const [activeInstallers, dossiersThisMonth, claudeCostAgg, revenueAgg] = await Promise.all([
    db.company.count(),
    db.dossierJob.count({ where: { startedAt: { gte: monthStart } } }),
    db.claudeUsageLog.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart } } }),
    db.payment.aggregate({ _sum: { amountTnd: true } }),
  ]);

  return {
    activeInstallers,
    dossiersThisMonth,
    claudeCostThisMonthUsd: Number(claudeCostAgg._sum.costUsd ?? 0),
    totalRevenueTnd: Number(revenueAgg._sum.amountTnd ?? 0),
  };
}

export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  // Defense-in-depth: see the matching comment on the installer list page for why this call
  // is here even though the (protected) layout already guards this route.
  await requireAuthenticatedSuperAdmin();

  const [stats, signupsToContact] = await Promise.all([computeDashboardStats(new Date()), countSignupsToContact()]);

  return (
    <main>
      <h1>Tableau de bord</h1>

      <div className="card-grid">
        <AdminStatsCard icon={Users} label="Installateurs actifs" value={stats.activeInstallers} />
        <AdminStatsCard icon={ChartBar} label="Dossiers ce mois" value={stats.dossiersThisMonth} />
        <AdminStatsCard
          icon={Revenue}
          label="Coût Claude ce mois"
          value={`${stats.claudeCostThisMonthUsd.toFixed(2)} $`}
        />
        <AdminStatsCard
          icon={Payment}
          label="Revenu total"
          value={`${stats.totalRevenueTnd.toFixed(2)} TND`}
        />
        <Link href="/admin/inscriptions" style={{ textDecoration: 'none', color: 'inherit' }}>
          <AdminStatsCard icon={Users} label="Inscriptions à contacter" value={signupsToContact} />
        </Link>
      </div>
    </main>
  );
}
