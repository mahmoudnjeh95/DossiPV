import type { PrismaClient } from '@dossipv/db';
import { describeDatabase, type EquipmentTable } from './purge-test-items';

const CURATED_TABLES: EquipmentTable[] = ['spd', 'dcSwitch', 'dcFuse', 'acBreaker', 'acIsolator', 'cable', 'accessory'];

interface Delegate {
  findMany(args: unknown): Promise<{ id: string; brand: string; model: string; datasheetSourceUrl: string }[]>;
  update(args: unknown): Promise<unknown>;
}

/** Shared curated rows that cite a datasheet URL but have no stored file yet get their PDF downloaded and attached. */
export async function runAttachCuratedDatasheets(
  db: PrismaClient,
  options: { apply: boolean; log: (line: string) => void; fetchPdf: (url: string, model: string) => Promise<string> },
): Promise<{ attached: number; failed: number }> {
  options.log(`Base : ${describeDatabase(process.env.DATABASE_URL)}`);
  let attached = 0;
  let failed = 0;
  let pending = 0;

  for (const table of CURATED_TABLES) {
    const delegate = (db as unknown as Record<string, Delegate>)[table]!;
    const rows = await delegate.findMany({
      where: { ownerCompanyId: null, datasheetSourceUrl: { not: null }, datasheetFileId: null },
      select: { id: true, brand: true, model: true, datasheetSourceUrl: true },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    });
    for (const row of rows) {
      pending += 1;
      options.log(`[${table}] ${row.brand} ${row.model} — ${row.datasheetSourceUrl}`);
      if (!options.apply) continue;
      try {
        const fileId = await options.fetchPdf(row.datasheetSourceUrl, row.model);
        await delegate.update({ where: { id: row.id }, data: { datasheetFileId: fileId } });
        attached += 1;
      } catch {
        options.log(`fiche non téléchargée : ${row.datasheetSourceUrl}`);
        failed += 1;
      }
    }
  }

  options.log(options.apply
    ? `${attached} fiche(s) rattachée(s), ${failed} échec(s).`
    : `${pending} fiche(s) à télécharger — simulation, rien modifié (--apply pour télécharger).`);
  return { attached, failed };
}
