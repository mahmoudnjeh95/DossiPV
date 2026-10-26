import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from './layout';
import { AdminStatsCard } from './components/admin-stats-card';
import Link from 'next/link';
import { countSignupsToContact } from '../../../lib/admin-signups';
import { countPaymentsNeedingAttention } from '../../../lib/payments/admin';
import { expiringSubscriptionWhere } from '../../../lib/admin-search';
import { computeMonthRevenue } from '../../../lib/admin-revenue';
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

const tnd = (amount: number): string => `${amount.toFixed(2)} TND`;

export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  // Defense-in-depth: see the matching comment on the installer list page for why this call
  // is here even though the (protected) layout already guards this route.
  await requireAuthenticatedSuperAdmin();

  const now = new Date();
  const [stats, revenue, signupsToContact, paymentsToVerify] = await Promise.all([
    computeDashboardStats(now),
    computeMonthRevenue(now),
    countSignupsToContact(),
    countPaymentsNeedingAttention(),
  ]);
  const month = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Africa/Tunis' });

  return (
    <main>
      <h1>Tableau de bord</h1>

      <h2>Revenus — {month}</h2>
      <div className="card-grid">
        <AdminStatsCard icon={Payment} label="Encaissé ce mois (confirmé)" value={tnd(revenue.confirmedThisMonthTnd)} />
        <Link href="/admin/paiements" style={{ textDecoration: 'none', color: 'inherit' }}>
          <AdminStatsCard
            icon={Payment}
            label={`En attente ce mois (${revenue.pendingThisMonthCount} paiement${revenue.pendingThisMonthCount > 1 ? 's' : ''} à vérifier)`}
            value={tnd(revenue.pendingThisMonthTnd)}
          />
        </Link>
        <AdminStatsCard
          icon={Revenue}
          label={`Renouvellements attendus d'ici la fin du mois (${revenue.renewalsDueCount})`}
          value={tnd(revenue.renewalsDueTnd)}
        />
        <AdminStatsCard icon={ChartBar} label="Revenu mensuel estimé (abonnements en cours)" value={tnd(revenue.monthlyEstimateTnd)} />
      </div>

      <h2>Activité</h2>

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
          value={tnd(stats.totalRevenueTnd)}
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
