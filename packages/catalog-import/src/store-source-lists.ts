import type { PrismaClient } from '@dossipv/db';
import { describeDatabase } from './purge-test-items';
import { SOURCE_LISTS } from './sources';

const LISTS = [
  { kind: 'STEG_INVERTER_LIST', url: SOURCE_LISTS.stegInverters, fileName: 'liste-steg-onduleurs.pdf' },
  { kind: 'ANME_PANEL_LIST', url: SOURCE_LISTS.anmePanels, fileName: 'liste-anme-panneaux.pdf' },
] as const;

interface StoreDb {
  file: Pick<PrismaClient['file'], 'create'>;
  catalogSourceDocument: Pick<PrismaClient['catalogSourceDocument'], 'upsert'>;
}

export async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Downloads the STEG accepted-inverter list and the ANME accepted-panel list and stores each as a
 * File, one CatalogSourceDocument per kind (replaced on each run): the worker annexes the page
 * listing the project's inverter / module from them. The dry run only prints URLs and sizes.
 */
export async function runStoreSourceLists(
  db: StoreDb,
  options: {
    apply: boolean;
    log: (line: string) => void;
    download?: (url: string) => Promise<Buffer>;
    save: (buffer: Buffer, fileName: string, mimeType: string) => Promise<{ storageKey: string }>;
  },
): Promise<void> {
  const download = options.download ?? downloadPdf;
  options.log(`Base : ${describeDatabase(process.env.DATABASE_URL)}`);
  // One list failing (its site down) never keeps the other from being stored; the run still
  // ends in error so the operator sees it.
  const failed: string[] = [];
  for (const list of LISTS) {
    let buffer: Buffer;
    try {
      buffer = await download(list.url);
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(`Le fichier téléchargé n'est pas un PDF : ${list.url}`);
    } catch (error) {
      options.log(`liste non téléchargée : ${list.url}`);
      options.log(`  cause : ${error instanceof Error ? error.message : String(error)}`);
      failed.push(list.kind);
      continue;
    }
    options.log(`${list.kind} : ${list.url} — ${buffer.length} octets`);
    if (!options.apply) continue;
    const { storageKey } = await options.save(buffer, list.fileName, 'application/pdf');
    const file = await db.file.create({ data: { fileName: list.fileName, mimeType: 'pdf', storageKey } });
    const fields = { fileId: file.id, sourceUrl: list.url, fetchedAt: new Date() };
    await db.catalogSourceDocument.upsert({ where: { kind: list.kind }, create: { kind: list.kind, ...fields }, update: fields });
  }
  options.log(options.apply ? 'Listes enregistrées.' : 'Simulation, rien enregistré (--apply pour enregistrer).');
  if (failed.length > 0) throw new Error(`Liste(s) non téléchargée(s) : ${failed.join(', ')}.`);
}
