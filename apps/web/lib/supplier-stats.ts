import { db } from '@dossipv/db';
import { dossiersThisMonth } from './supplier-access';

export interface SupplierStats {
  installers: { id: string; name: string; dossiersThisMonth: number }[];
  totalDossiersThisMonth: number;
  products: { id: string; kind: 'PV_MODULE' | 'INVERTER'; label: string; projects: number }[];
}

/**
 * The supplier's figures: counts only. Project, client and site data (names, CIN, addresses, STEG
 * references) never leave the installers' side; the company names are the sponsored installers' own.
 */
export async function loadSupplierStats(supplierId: string, now: Date = new Date()): Promise<SupplierStats> {
  const [installers, carried] = await Promise.all([
    db.company.findMany({ where: { sponsorCompanyId: supplierId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.supplierProduct.findMany({
      where: { supplierCompanyId: supplierId },
      include: { pvModule: { select: { brand: true, model: true } }, inverter: { select: { brand: true, model: true } } },
    }),
  ]);
  const dossiers = await dossiersThisMonth(installers.map((i) => i.id), now);

  const ofInstallers = { project: { company: { sponsorCompanyId: supplierId } } };
  const moduleIds = carried.flatMap((p) => (p.pvModuleId ? [p.pvModuleId] : []));
  const inverterIds = carried.flatMap((p) => (p.inverterId ? [p.inverterId] : []));
  const [configs, inverterUses] = await Promise.all([
    moduleIds.length ? db.projectArrayConfig.findMany({ where: { ...ofInstallers, moduleId: { in: moduleIds } }, select: { moduleId: true, projectId: true } }) : [],
    inverterIds.length
      ? db.projectArrayInverter.findMany({ where: { arrayConfig: ofInstallers, inverterId: { in: inverterIds } }, select: { inverterId: true, arrayConfig: { select: { projectId: true } } } })
      : [],
  ]);
  const modulesProjects = new Map<string, Set<string>>();
  for (const c of configs) modulesProjects.set(c.moduleId, (modulesProjects.get(c.moduleId) ?? new Set()).add(c.projectId));
  const invertersProjects = new Map<string, Set<string>>();
  for (const u of inverterUses) invertersProjects.set(u.inverterId, (invertersProjects.get(u.inverterId) ?? new Set()).add(u.arrayConfig.projectId));

  const products: SupplierStats['products'] = [];
  for (const p of carried) {
    if (p.pvModuleId && p.pvModule) products.push({ id: p.id, kind: 'PV_MODULE', label: `${p.pvModule.brand} ${p.pvModule.model}`, projects: modulesProjects.get(p.pvModuleId)?.size ?? 0 });
    else if (p.inverterId && p.inverter) products.push({ id: p.id, kind: 'INVERTER', label: `${p.inverter.brand} ${p.inverter.model}`, projects: invertersProjects.get(p.inverterId)?.size ?? 0 });
  }
  products.sort((a, b) => b.projects - a.projects || a.label.localeCompare(b.label));

  const rows = installers.map((i) => ({ id: i.id, name: i.name, dossiersThisMonth: dossiers.get(i.id) ?? 0 }));
  return { installers: rows, totalDossiersThisMonth: rows.reduce((sum, r) => sum + r.dossiersThisMonth, 0), products };
}

/** The last `count` months (UTC), the current one first: the month selector of the statistics page. */
export function lastMonths(now: Date = new Date(), count = 6): { key: string; start: Date }[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return { key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`, start };
  });
}

export interface ProductMonthStat {
  id: string;
  kind: 'PV_MODULE' | 'INVERTER';
  label: string;
  highlighted: boolean;
  /** Times offered in a sponsored proposal / applied by an installer (anonymous daily counters). */
  shown: number;
  applied: number;
  /** Dossiers generated this month by the supplier's sponsored installers with the product. */
  dossiers: number;
  /** kWc of those dossiers' installations. */
  kwc: number;
}

/**
 * Per carried product, for the month containing `month`: sponsored-proposal views and applications
 * (summed daily counters) and, for the supplier's own sponsored installers, distinct dossiers (a
 * project with a non-failed generation job that month) and kWc (modules × Pmax of the project's
 * array). Aggregates only: no installer, client or site field is selected, and the counters record
 * no installer.
 */
export async function loadProductMonthStats(supplierId: string, month: Date): Promise<ProductMonthStat[]> {
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const carried = await db.supplierProduct.findMany({
    where: { supplierCompanyId: supplierId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      highlighted: true,
      pvModuleId: true,
      inverterId: true,
      pvModule: { select: { brand: true, model: true } },
      inverter: { select: { brand: true, model: true } },
    },
  });
  if (carried.length === 0) return [];

  const [daily, jobs] = await Promise.all([
    db.supplierProductDailyStat.findMany({
      where: { supplierProductId: { in: carried.map((p) => p.id) }, date: { gte: start, lt: end } },
      select: { supplierProductId: true, shownCount: true, appliedCount: true },
    }),
    db.dossierJob.findMany({
      where: { startedAt: { gte: start, lt: end }, status: { not: 'FAILED' }, project: { company: { sponsorCompanyId: supplierId } } },
      select: {
        projectId: true,
        project: {
          select: {
            arrayConfig: {
              select: {
                moduleId: true,
                module: { select: { pmaxW: true } },
                inverters: { select: { inverterId: true, mppts: { select: { stringsInParallel: true, modulesPerString: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const counters = new Map<string, { shown: number; applied: number }>();
  for (const row of daily) {
    const entry = counters.get(row.supplierProductId) ?? { shown: 0, applied: 0 };
    entry.shown += row.shownCount;
    entry.applied += row.appliedCount;
    counters.set(row.supplierProductId, entry);
  }

  // One entry per project (a project with several jobs counts once): its kWc and the catalog items it uses.
  const projects = new Map<string, { kwc: number; moduleId: string; inverterIds: Set<string> }>();
  for (const job of jobs) {
    const config = job.project.arrayConfig;
    if (!config || projects.has(job.projectId)) continue;
    const modules = config.inverters.reduce((total, inv) => total + inv.mppts.reduce((sub, m) => sub + m.stringsInParallel * m.modulesPerString, 0), 0);
    projects.set(job.projectId, { kwc: (modules * config.module.pmaxW) / 1000, moduleId: config.moduleId, inverterIds: new Set(config.inverters.map((inv) => inv.inverterId)) });
  }

  return carried.flatMap((p) => {
    const item = p.pvModule ?? p.inverter;
    if (!item) return [];
    let dossiers = 0;
    let kwc = 0;
    for (const project of projects.values()) {
      const uses = p.pvModuleId ? project.moduleId === p.pvModuleId : p.inverterId !== null && project.inverterIds.has(p.inverterId);
      if (!uses) continue;
      dossiers += 1;
      kwc += project.kwc;
    }
    const count = counters.get(p.id);
    return [
      {
        id: p.id,
        kind: p.kind as 'PV_MODULE' | 'INVERTER',
        label: `${item.brand} ${item.model}`,
        highlighted: p.highlighted,
        shown: count?.shown ?? 0,
        applied: count?.applied ?? 0,
        dossiers,
        kwc: Math.round(kwc * 100) / 100,
      },
    ];
  });
}
