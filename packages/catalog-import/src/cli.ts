/* eslint-disable no-console -- developer CLI */
import { mkdir, readFile, writeFile } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { tmpdir } from 'os';
import { join } from 'path';
import { cachedDatasheet, download } from './datasheet-cache';
import { parseRegistry, checkRegistryAgainstListings, type DatasheetFamily } from './datasheet-registry';
import { extractDatasheet } from './extract-datasheet';
import { buildInverterEntry, buildModuleEntry, sortEntries, type CatalogInverterEntry, type CatalogPvModuleEntry } from './build-catalog';
import type { AnmePanelListing, StegInverterListing } from './types';
import type { InverterRecord, PvModuleRecord } from './validate-records';
import { pdfToText } from './pdf-text';
import { parseStegList } from './parse-steg-list';
import { parseAnmeList } from './parse-anme-list';
import { DATA_DIR, SOURCE_LISTS } from './sources';
import { runImport } from './run-import';

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

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(join(DATA_DIR, relativePath), 'utf8')) as T;
}

async function extract(args: string[]): Promise<void> {
  const brandFilter = args[0];
  const panels = (await readJson<{ listings: AnmePanelListing[] }>('sources/anme-panels.json')).listings;
  const inverters = (await readJson<{ listings: StegInverterListing[] }>('sources/steg-inverters.json')).listings;
  const families = parseRegistry(await readJson<unknown>('datasheets.json'));

  const problems = checkRegistryAgainstListings(families, new Set(panels.map((p) => p.model)), new Set(inverters.map((i) => i.model)));
  if (problems.length > 0) throw new Error(`datasheets.json :\n${problems.join('\n')}`);

  const moduleEntries = new Map((await readJson<CatalogPvModuleEntry[]>('pv-modules.json').catch(() => [])).map((e) => [e.model, e]));
  const inverterEntries = new Map((await readJson<CatalogInverterEntry[]>('inverters.json').catch(() => [])).map((e) => [e.model, e]));
  const client = new Anthropic();
  const failures: string[] = [];

  for (const family of families.filter((f: DatasheetFamily) => !brandFilter || f.brand === brandFilter)) {
    try {
      const pdf = await readFile(await cachedDatasheet(family.url));
      const { records, missingModels } = await extractDatasheet(family, pdf, client);
      for (const model of missingModels) failures.push(`${model} : absent de ${family.url}`);
      for (const record of records) {
        if (family.kind === 'PV_MODULE') {
          moduleEntries.set(record.model, buildModuleEntry(record as PvModuleRecord, family, panels.find((p) => p.model === record.model)!));
        } else {
          inverterEntries.set(record.model, buildInverterEntry(record as InverterRecord, family, inverters.find((i) => i.model === record.model)!));
        }
      }
      console.log(`${family.brand} — ${family.url} : ${records.length} modèle(s).`);
    } catch (error) {
      failures.push(`${family.url} : ${(error as Error).message}`);
    }
  }

  await writeJson('pv-modules.json', sortEntries([...moduleEntries.values()]));
  await writeJson('inverters.json', sortEntries([...inverterEntries.values()]));
  const withErrors = [...moduleEntries.values(), ...inverterEntries.values()].filter((e) => e.errors.length > 0).length;
  console.log(`${moduleEntries.size} panneaux, ${inverterEntries.size} onduleurs, ${withErrors} avec erreurs.`);
  if (failures.length > 0) console.log(`Échecs :\n${failures.join('\n')}`);
}

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  'fetch-lists': fetchLists,
  extract,
  import: (args) => runImport({ dryRun: !args.includes('--apply') }),
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
