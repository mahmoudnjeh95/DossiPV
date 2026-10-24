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
