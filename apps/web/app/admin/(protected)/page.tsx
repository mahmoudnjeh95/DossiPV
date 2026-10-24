import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from './layout';
import { AdminStatsCard } from './components/admin-stats-card';
import Link from 'next/link';
import { countSignupsToContact } from '../../../lib/admin-signups';
import { countPaymentsNeedingAttention } from '../../../lib/payments/admin';
import { expiringSubscriptionWhere } from '../../../lib/admin-search';
import { Users, ChartBar, Revenue, Payment } from '@dossipv/icons';

export function getMonthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export interface DashboardStats {
  activeInstallers: number;
  dossiersThisMonth: number;
  claudeCostThisMonthUsd: number;
  totalRevenueTnd: number;
  suppliers: number;
  sponsoredInstallers: number;
  /** Active installer subscriptions ending within 30 days. */
  expiringInstallers: number;
  /** Active supplier packs ending within 30 days. */
  expiringSuppliers: number;
}

export async function computeDashboardStats(now: Date): Promise<DashboardStats> {
  const monthStart = getMonthStart(now);

  const [activeInstallers, dossiersThisMonth, claudeCostAgg, revenueAgg, suppliers, sponsoredInstallers, expiringInstallers, expiringSuppliers] = await Promise.all([
    db.company.count({ where: { kind: 'INSTALLER' } }),
    db.dossierJob.count({ where: { startedAt: { gte: monthStart } } }),
    db.claudeUsageLog.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart } } }),
    db.payment.aggregate({ _sum: { amountTnd: true } }),
    db.company.count({ where: { kind: 'SUPPLIER' } }),
    db.company.count({ where: { kind: 'INSTALLER', sponsorCompanyId: { not: null } } }),
    db.company.count({ where: { kind: 'INSTALLER', ...expiringSubscriptionWhere(now) } }),
    db.company.count({ where: { kind: 'SUPPLIER', ...expiringSubscriptionWhere(now) } }),
  ]);

  return {
    activeInstallers,
    dossiersThisMonth,
    claudeCostThisMonthUsd: Number(claudeCostAgg._sum.costUsd ?? 0),
    totalRevenueTnd: Number(revenueAgg._sum.amountTnd ?? 0),
    suppliers,
    sponsoredInstallers,
    expiringInstallers,
    expiringSuppliers,
  };
}

export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  // Defense-in-depth: see the matching comment on the installer list page for why this call
  // is here even though the (protected) layout already guards this route.
  await requireAuthenticatedSuperAdmin();

  const [stats, signupsToContact, paymentsToVerify] = await Promise.all([
    computeDashboardStats(new Date()),
    countSignupsToContact(),
    countPaymentsNeedingAttention(),
  ]);

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
        <Link href="/admin/fournisseurs" style={{ textDecoration: 'none', color: 'inherit' }}>
          <AdminStatsCard icon={Users} label="Fournisseurs" value={stats.suppliers} />
        </Link>
        <AdminStatsCard icon={Users} label="Installateurs parrainés" value={stats.sponsoredInstallers} />
        <Link href="/admin/inscriptions" style={{ textDecoration: 'none', color: 'inherit' }}>
          <AdminStatsCard icon={Users} label="Inscriptions à contacter" value={signupsToContact} />
        </Link>
        <Link href="/admin/paiements" style={{ textDecoration: 'none', color: 'inherit' }}>
          <AdminStatsCard icon={Payment} label="Paiements P2P à vérifier" value={paymentsToVerify} />
        </Link>
        <Link href="/admin/installers?expiring=1" style={{ textDecoration: 'none', color: 'inherit' }}>
          <AdminStatsCard icon={Users} label="Installateurs : abonnement expirant (30 j)" value={stats.expiringInstallers} />
        </Link>
        <Link href="/admin/fournisseurs?expiring=1" style={{ textDecoration: 'none', color: 'inherit' }}>
          <AdminStatsCard icon={Users} label="Fournisseurs : pack expirant (30 j)" value={stats.expiringSuppliers} />
        </Link>
      </div>
    </main>
  );
}
