import { db } from '@dossipv/db';

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
  const stats = await computeDashboardStats(new Date());

  return (
    <main>
      <h1>Tableau de bord</h1>
      <ul>
        <li>Installateurs actifs : {stats.activeInstallers}</li>
        <li>Dossiers générés ce mois : {stats.dossiersThisMonth}</li>
        <li>Coût Claude ce mois : {stats.claudeCostThisMonthUsd.toFixed(2)} $</li>
        <li>Revenu total : {stats.totalRevenueTnd.toFixed(2)} TND</li>
      </ul>
    </main>
  );
}
