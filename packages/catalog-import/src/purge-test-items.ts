import type { PrismaClient } from '@dossipv/db';

export type EquipmentTable = 'pvModule' | 'inverter' | 'spd' | 'dcSwitch' | 'dcFuse' | 'acBreaker' | 'acIsolator' | 'cable' | 'accessory';

export interface SharedItemRow {
  table: EquipmentTable;
  id: string;
  brand: string;
  model: string;
  datasheetSourceUrl: string | null;
  referencingProjectIds: string[];
}

/** Unsourced shared rows (no datasheetSourceUrl) are test or hand-entered equipment; sourced rows are kept. */
export function selectTestItems(items: SharedItemRow[]): { deletable: SharedItemRow[]; referenced: SharedItemRow[] } {
  const unsourced = items.filter((item) => item.datasheetSourceUrl === null);
  return {
    deletable: unsourced.filter((item) => item.referencingProjectIds.length === 0),
    referenced: unsourced.filter((item) => item.referencingProjectIds.length > 0),
  };
}

/** The `LibraryItem` foreign key that points at each equipment table. */
const LIBRARY_FK: Record<EquipmentTable, string> = {
  pvModule: 'pvModuleId',
  inverter: 'inverterId',
  spd: 'spdId',
  dcSwitch: 'dcSwitchId',
  dcFuse: 'dcFuseId',
  acBreaker: 'acBreakerId',
  acIsolator: 'acIsolatorId',
  cable: 'cableId',
  accessory: 'accessoryId',
};

interface ProjectRef { projectId: string }
interface TableSpec {
  table: EquipmentTable;
  include: Record<string, unknown>;
  projectIds: (row: Record<string, unknown>) => string[];
}

const refs = (row: Record<string, unknown>, ...fields: string[]): string[] =>
  fields.flatMap((field) => (row[field] as ProjectRef[]).map((ref) => ref.projectId));
const projectSelect = { select: { projectId: true } };

const TABLES: TableSpec[] = [
  {
    table: 'pvModule',
    include: { arrayConfigs: projectSelect },
    projectIds: (row) => refs(row, 'arrayConfigs'),
  },
  {
    table: 'inverter',
    include: { arrayInverters: { select: { arrayConfig: { select: { projectId: true } } } } },
    projectIds: (row) => (row.arrayInverters as { arrayConfig: ProjectRef }[]).map((entry) => entry.arrayConfig.projectId),
  },
  { table: 'spd', include: { protectionsDc: projectSelect, protectionsAc: projectSelect }, projectIds: (row) => refs(row, 'protectionsDc', 'protectionsAc') },
  { table: 'dcSwitch', include: { protections: projectSelect }, projectIds: (row) => refs(row, 'protections') },
  { table: 'dcFuse', include: { protections: projectSelect }, projectIds: (row) => refs(row, 'protections') },
  { table: 'acBreaker', include: { protections: projectSelect }, projectIds: (row) => refs(row, 'protections') },
  { table: 'acIsolator', include: { protections: projectSelect }, projectIds: (row) => refs(row, 'protections') },
  { table: 'cable', include: { cableRuns: projectSelect, earthingCableFor: projectSelect }, projectIds: (row) => refs(row, 'cableRuns', 'earthingCableFor') },
  {
    table: 'accessory',
    include: { connectorFor: projectSelect, cableTrayFor: projectSelect, distributionBlockFor: projectSelect },
    projectIds: (row) => refs(row, 'connectorFor', 'cableTrayFor', 'distributionBlockFor'),
  },
];

/** `host:port/database` of a connection URL, never the credentials. */
export function describeDatabase(url: string | undefined): string {
  if (!url) return 'inconnue (DATABASE_URL absente)';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return 'illisible (DATABASE_URL invalide)';
  }
}

interface Delegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  deleteMany(args: unknown): Promise<unknown>;
}

export async function runPurge(
  db: PrismaClient,
  options: { apply: boolean; log: (line: string) => void },
): Promise<{ deleted: number; referenced: number }> {
  options.log(`Base : ${describeDatabase(process.env.DATABASE_URL)}`);
  const delegateOf = (table: EquipmentTable): Delegate => (db as unknown as Record<string, Delegate>)[table]!;
  const libraryCounts = new Map<string, number>();
  const items: SharedItemRow[] = [];

  for (const spec of TABLES) {
    const rows = await delegateOf(spec.table).findMany({
      where: { ownerCompanyId: null, datasheetSourceUrl: null },
      include: { ...spec.include, libraryItems: { select: { companyId: true } } },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    });
    for (const row of rows) {
      const id = row.id as string;
      libraryCounts.set(id, new Set((row.libraryItems as { companyId: string }[]).map((entry) => entry.companyId)).size);
      items.push({
        table: spec.table,
        id,
        brand: row.brand as string,
        model: row.model as string,
        datasheetSourceUrl: (row.datasheetSourceUrl as string | null) ?? null,
        referencingProjectIds: [...new Set(spec.projectIds(row))],
      });
    }
  }

  const { deletable, referenced } = selectTestItems(items);
  const describe = (item: SharedItemRow): string => {
    const libraries = libraryCounts.get(item.id) ?? 0;
    const used = item.referencingProjectIds.length > 0
      ? `utilisé par ${item.referencingProjectIds.length} projet(s): ${item.referencingProjectIds.join(', ')}`
      : 'supprimable';
    const removal = item.referencingProjectIds.length > 0 && libraries > 0 ? ` — sera retiré de ${libraries} bibliothèque(s)` : '';
    return `[${item.table}] ${item.brand} ${item.model} — sans source (test ou saisie manuelle) — ${used} — dans ${libraries} bibliothèque(s)${removal}`;
  };
  for (const item of [...deletable, ...referenced]) options.log(describe(item));

  if (options.apply) {
    await db.$transaction(async (tx) => {
      for (const item of deletable) {
        if (item.table === 'cable') await tx.cableSection.deleteMany({ where: { cableId: item.id } });
        await (tx as unknown as Record<string, Delegate>)[item.table]!.deleteMany({ where: { id: item.id } });
      }
      // Referenced unsourced items stay for their projects but leave every library.
      for (const item of referenced) {
        await tx.libraryItem.deleteMany({ where: { [LIBRARY_FK[item.table]]: item.id } });
      }
    });
  }
  options.log(`${deletable.length} supprimable(s), ${referenced.length} utilisé(s) par des projets (conservés)${options.apply ? ' — suppression effectuée' : ' — simulation, rien supprimé (--apply pour supprimer)'}.`);
  return { deleted: options.apply ? deletable.length : 0, referenced: referenced.length };
}
