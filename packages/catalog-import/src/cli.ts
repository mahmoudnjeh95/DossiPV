/* eslint-disable no-console -- developer CLI */
import { mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { download } from './datasheet-cache';
import { pdfToText } from './pdf-text';
import { parseStegList } from './parse-steg-list';
import { parseAnmeList } from './parse-anme-list';
import { DATA_DIR, SOURCE_LISTS } from './sources';

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  const fullPath = join(DATA_DIR, relativePath);
  await mkdir(join(fullPath, '..'), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchLists(): Promise<void> {
  const fetchedAt = new Date().toISOString();

  const stegPdf = join(tmpdir(), 'dossipv-steg.pdf');
  await download(SOURCE_LISTS.stegInverters, stegPdf);
  const steg = parseStegList(await pdfToText(stegPdf, 'table'));
  await writeJson('sources/steg-inverters.json', { sourceUrl: SOURCE_LISTS.stegInverters, fetchedAt, listings: steg, unparsedLines: [] });

  const anmePdf = join(tmpdir(), 'dossipv-anme.pdf');
  await download(SOURCE_LISTS.anmePanels, anmePdf);
  const anme = parseAnmeList(await pdfToText(anmePdf, 'table'));
  await writeJson('sources/anme-panels.json', { sourceUrl: SOURCE_LISTS.anmePanels, fetchedAt, ...anme });

  console.log(`STEG : ${steg.length} onduleurs. ANME : ${anme.listings.length} panneaux, ${anme.unparsedLines.length} ligne(s) à saisir à la main.`);
}

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  'fetch-lists': fetchLists,
};

const [command = '', ...args] = process.argv.slice(2);
const run = COMMANDS[command];
if (!run) {
  console.error(`Commandes : ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}
run(args).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
