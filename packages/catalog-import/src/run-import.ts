/* eslint-disable no-console -- developer CLI */
import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '@dossipv/db';
import { saveFile } from '@dossipv/file-storage';
import type { CatalogInverterEntry, CatalogPvModuleEntry } from './build-catalog';
import { planImport } from './plan-import';
import { pickPlanningRow, planCuratedImport, type CuratedPlan } from './plan-curated';
import { DATA_DIR } from './sources';
import { cachedDatasheet } from './datasheet-cache';

const MODULE_VALUES = ['pmaxW', 'vmpV', 'impA', 'vocV', 'iscA', 'tempCoeffVocPct', 'tempCoeffIscPct', 'tempCoeffPmaxPct', 'tempCoeffVmpPct', 'irmA', 'maxSystemVoltageV', 'bifacial', 'bifacialGainPct', 'lengthMm', 'widthMm', 'weightKg', 'noctC'] as const;
const MODULE_REQUIRED = ['pmaxW', 'vmpV', 'impA', 'vocV', 'iscA', 'tempCoeffVocPct', 'tempCoeffIscPct', 'tempCoeffPmaxPct', 'irmA', 'maxSystemVoltageV', 'lengthMm', 'widthMm', 'weightKg'] as const;
const INVERTER_VALUES = ['phases', 'pacW', 'sacVA', 'vdcMaxV', 'mpptMinV', 'mpptMaxV', 'startUpV', 'mpptCount', 'inputsPerMppt', 'idcMaxPerMpptA', 'iscMaxPerMpptA', 'vacNomV', 'vacRangeV', 'iacMaxA', 'integratedDcSwitch'] as const;
const INVERTER_REQUIRED = ['phases', 'pacW', 'sacVA', 'vdcMaxV', 'mpptMinV', 'mpptMaxV', 'startUpV', 'mpptCount', 'inputsPerMppt', 'idcMaxPerMpptA', 'iscMaxPerMpptA', 'vacNomV', 'iacMaxA'] as const;

function pick<T extends object>(entry: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, (entry as Record<string, unknown>)[key] ?? null]));
}

function notesOf(entry: { errors: string[]; warnings: string[] }, extra: string[] = []): string | null {
  const lines = [...entry.errors.map((e) => `Erreur : ${e}`), ...entry.warnings.map((w) => `À vérifier : ${w}`), ...extra];
  return lines.length > 0 ? lines.join('\n') : null;
}

async function uploadDatasheet(url: string, model: string): Promise<string> {
  const buffer = await readFile(await cachedDatasheet(url));
  const { storageKey } = await saveFile(buffer, `${model}.pdf`, 'application/pdf');
  const file = await db.file.create({ data: { fileName: `${model}.pdf`, mimeType: 'pdf', storageKey } });
  return file.id;
}

interface CuratedCable { brand: string; model: string; usage: 'DC_SOLAR' | 'AC' | 'EARTH'; conductor: string; insulation: string; standard: string; source: string; sections: { sectionMm2: number; izA: number; izReferenceMethod: string }[] }
type CuratedProtection =
  | { kind: 'SPD'; brand: string; model: string; side: 'DC' | 'AC'; type: number; poles: number; ucV: number; upKV: number; inKA: number; imaxKA: number; iscpvKA: number | null; source: string }
  | { kind: 'DC_SWITCH'; brand: string; model: string; ratedVoltageV: number; ratedCurrentA: number; poles: number; source: string }
  | { kind: 'DC_FUSE'; brand: string; model: string; ratedVoltageV: number; ratedCurrentA: number; source: string }
  | { kind: 'AC_BREAKER'; brand: string; model: string; ratedCurrentA: number; curve: string | null; breakingCapacityKA: number | null; source: string }
  | { kind: 'AC_ISOLATOR'; brand: string; model: string; ratedCurrentA: number; source: string };

async function importCurated(dryRun: boolean, count: (key: string) => void): Promise<void> {
  const cables = JSON.parse(await readFile(join(DATA_DIR, 'cables.json'), 'utf8')) as CuratedCable[];
  const protections = JSON.parse(await readFile(join(DATA_DIR, 'protections.json'), 'utf8')) as CuratedProtection[];
  const draft = { ownerCompanyId: null, catalogStatus: 'DRAFT' as const };
  const countCurated = (label: string, plan: CuratedPlan, what: string): void => {
    if (plan === 'create-alongside') console.log(`conflit : ${what} existe sans source — l'entrée curée est créée à côté`);
    count(plan === 'skip' ? `${label} déjà présents` : plan === 'create' ? `${label} create` : `${label} create-alongside`);
  };

  for (const { source, sections, ...cable } of cables) {
    const plan = planCuratedImport(await db.cable.findMany({ where: { ownerCompanyId: null, brand: cable.brand, model: cable.model }, select: { datasheetSourceUrl: true } }));
    countCurated('câbles', plan, `câble ${cable.brand} ${cable.model}`);
    if (plan === 'skip' || dryRun) continue;
    await db.cable.create({ data: { ...cable, ...draft, datasheetSourceUrl: source, importNotes: source, sections: { create: sections } } });
  }

  for (const { kind, source, ...item } of protections) {
    const where = { ownerCompanyId: null, brand: item.brand, model: item.model };
    const data = { ...item, ...draft, datasheetSourceUrl: source, importNotes: source };
    const select = { datasheetSourceUrl: true };
    const rows =
      kind === 'SPD' ? await db.spd.findMany({ where, select })
      : kind === 'DC_SWITCH' ? await db.dcSwitch.findMany({ where, select })
      : kind === 'DC_FUSE' ? await db.dcFuse.findMany({ where, select })
      : kind === 'AC_BREAKER' ? await db.acBreaker.findMany({ where, select })
      : await db.acIsolator.findMany({ where, select });
    const plan = planCuratedImport(rows);
    countCurated(kind, plan, `${kind} ${item.brand} ${item.model}`);
    if (plan === 'skip' || dryRun) continue;
    if (kind === 'SPD') await db.spd.create({ data: data as never });
    else if (kind === 'DC_SWITCH') await db.dcSwitch.create({ data: data as never });
    else if (kind === 'DC_FUSE') await db.dcFuse.create({ data: data as never });
    else if (kind === 'AC_BREAKER') await db.acBreaker.create({ data: data as never });
    else await db.acIsolator.create({ data: data as never });
  }
}

export async function runImport({ dryRun }: { dryRun: boolean }): Promise<void> {
  const modules = JSON.parse(await readFile(join(DATA_DIR, 'pv-modules.json'), 'utf8')) as CatalogPvModuleEntry[];
  const inverters = JSON.parse(await readFile(join(DATA_DIR, 'inverters.json'), 'utf8')) as CatalogInverterEntry[];
  const counts: Record<string, number> = {};
  const count = (key: string): void => { counts[key] = (counts[key] ?? 0) + 1; };

  for (const entry of modules) {
    const values = pick(entry, MODULE_VALUES);
    const { row: existing, conflict } = pickPlanningRow(await db.pvModule.findMany({ where: { ownerCompanyId: null, brand: entry.brand, model: entry.model } }));
    if (conflict) console.log(`conflit : panneau ${entry.brand} ${entry.model} existe sans source — l'entrée importée est créée à côté`);
    const action = planImport(existing ? { id: existing.id, catalogStatus: existing.catalogStatus, values: pick(existing, MODULE_VALUES) } : null, { errors: entry.errors, values }, MODULE_REQUIRED);
    count(`panneaux ${conflict && action.kind === 'create' ? 'create-alongside' : action.kind}`);
    if (dryRun || action.kind === 'skip') {
      if (action.kind === 'skip') console.log(`Ignoré ${entry.brand} ${entry.model} : ${action.reason}`);
      continue;
    }
    const homologation = { homologationReference: entry.homologationReference, homologationValidTo: new Date(entry.homologationValidTo), datasheetSourceUrl: entry.datasheetSourceUrl };
    if (action.kind === 'create') {
      await db.pvModule.create({
        data: { brand: entry.brand, model: entry.model, ...(values as object), ...homologation, catalogStatus: 'DRAFT', importNotes: notesOf(entry), datasheetFileId: await uploadDatasheet(entry.datasheetSourceUrl, entry.model) } as never,
      });
    } else if (action.kind === 'update-draft') {
      await db.pvModule.update({ where: { id: existing!.id }, data: { ...(values as object), ...homologation, importNotes: notesOf(entry) } as never });
    } else {
      await db.pvModule.update({
        where: { id: existing!.id },
        data: { ...homologation, importNotes: action.differences.length > 0 ? `L'import propose d'autres valeurs :\n${action.differences.join('\n')}` : null },
      });
    }
  }

  for (const entry of inverters) {
    const values = pick(entry, INVERTER_VALUES);
    const { row: existing, conflict } = pickPlanningRow(await db.inverter.findMany({ where: { ownerCompanyId: null, brand: entry.brand, model: entry.model } }));
    if (conflict) console.log(`conflit : onduleur ${entry.brand} ${entry.model} existe sans source — l'entrée importée est créée à côté`);
    const action = planImport(existing ? { id: existing.id, catalogStatus: existing.catalogStatus, values: pick(existing, INVERTER_VALUES) } : null, { errors: entry.errors, values }, INVERTER_REQUIRED);
    count(`onduleurs ${conflict && action.kind === 'create' ? 'create-alongside' : action.kind}`);
    if (dryRun || action.kind === 'skip') {
      if (action.kind === 'skip') console.log(`Ignoré ${entry.brand} ${entry.model} : ${action.reason}`);
      continue;
    }
    const steg = { stegApproved: true, homologationValidTo: new Date(entry.homologationValidTo), datasheetSourceUrl: entry.datasheetSourceUrl };
    const dataValues = { ...values, integratedDcSwitch: values.integratedDcSwitch ?? false };
    if (action.kind === 'create') {
      await db.inverter.create({
        data: { brand: entry.brand, model: entry.model, ...(dataValues as object), ...steg, catalogStatus: 'DRAFT', importNotes: notesOf(entry), datasheetFileId: await uploadDatasheet(entry.datasheetSourceUrl, entry.model) } as never,
      });
    } else if (action.kind === 'update-draft') {
      await db.inverter.update({ where: { id: existing!.id }, data: { ...(dataValues as object), ...steg, importNotes: notesOf(entry) } as never });
    } else {
      await db.inverter.update({
        where: { id: existing!.id },
        data: { ...steg, importNotes: action.differences.length > 0 ? `L'import propose d'autres valeurs :\n${action.differences.join('\n')}` : null },
      });
    }
  }

  await importCurated(dryRun, count);

  console.log(`${dryRun ? '[simulation] ' : ''}${JSON.stringify(counts)}`);
  await db.$disconnect();
}
