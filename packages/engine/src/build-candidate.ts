import type { MpptConfig } from './types';
import type {
  BuildCandidateResult,
  CatalogCable,
  CatalogDcFuse,
  CatalogInverter,
  CatalogModule,
  CatalogSpd,
  SizingCatalog,
  SizingContext,
} from './sizing-types';
import { runEngine, type CableRunInput, type RunEngineInput } from './run-engine';
import { dcFuseCheckInput, dcFuseRequired, iscFieldDesign, stringVmpStc, stringVocTmin } from './protections';
import { izCorrected, duDcV, duDcPct, duAcV, duAcPct } from './cabling';
import { checkC08, checkC09, checkC10, checkC11, checkC13, checkC14, checkC16 } from './checks';

// Fixed run parameters (spec §5 B5; the cabling form's defaults for a new run).
const SITE_PHASES = 1;
/** DC run: cable tray in the sun (TRAY_SUN, 80 °C), NF C 15-100 install method 13. */
const DC_INSTALL_METHOD = '13';
const DC_AMBIENT_TEMP_C = 80;
/** AC run: technical room (TECHNICAL_ROOM, 50 °C), install method 3A. */
const AC_INSTALL_METHOD = '3A';
const AC_AMBIENT_TEMP_C = 50;
const GROUPED_CIRCUITS = 1;
const LAYERS = 1;
/** Values every proposal's SPDs are checked against (C11); applying a proposal stores them too. */
export const EQUIPMENT_IMPULSE_WITHSTAND_KV = 4;
export const SPD_TO_EQUIPMENT_DISTANCE_M = 1;
const EARTH_SECTION_MM2 = 16;

const lengthFormat = new Intl.NumberFormat('fr-FR');

interface Named {
  brand: string;
  model: string;
}

type DcSpd = CatalogSpd & { iscpvKA: number };

interface CableSection {
  cable: CatalogCable;
  section: CatalogCable['sections'][number];
}

function compareNames(a: Named, b: Named): number {
  return a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model);
}

/** The lowest-rated item (then brand/model) that passes, or null. */
function smallestPassing<T extends Named>(
  items: readonly T[],
  rating: (item: T) => number,
  passes: (item: T) => boolean,
): T | null {
  const sorted = [...items].sort((a, b) => rating(a) - rating(b) || compareNames(a, b));
  return sorted.find(passes) ?? null;
}

/** Every section of every cable of this usage, smallest section first (then brand/model). */
function cableSections(cables: readonly CatalogCable[], usage: CatalogCable['usage']): CableSection[] {
  return cables
    .filter((cable) => cable.usage === usage)
    .flatMap((cable) => cable.sections.map((section) => ({ cable, section })))
    .sort((a, b) => a.section.sectionMm2 - b.section.sectionMm2 || compareNames(a.cable, b.cable));
}

function cableRun(
  { cable, section }: CableSection,
  lengthM: number,
  installMethod: string,
  ambientTempC: number,
): CableRunInput {
  return {
    conductor: cable.conductor,
    insulation: cable.insulation,
    sectionMm2: section.sectionMm2,
    lengthM,
    installMethod,
    referenceMethod: section.izReferenceMethod,
    ambientTempC,
    groupedCircuits: GROUPED_CIRCUITS,
    layers: LAYERS,
    izBaseA: section.izA,
  };
}

function runIzCorrected(run: CableRunInput): number {
  return izCorrected(
    run.izBaseA,
    run.installMethod,
    run.referenceMethod,
    run.groupedCircuits,
    run.layers,
    run.ambientTempC,
    run.insulation,
  );
}

/** Strings spread as evenly as possible, the first MPPTs taking the extra ones; empty MPPTs omitted. */
function spreadStrings(stringCount: number, mpptCount: number, modulesPerString: number): MpptConfig[] {
  const base = Math.floor(stringCount / mpptCount);
  const extra = stringCount % mpptCount;
  const mppts: MpptConfig[] = [];
  for (let index = 0; index < mpptCount; index++) {
    const strings = base + (index < extra ? 1 : 0);
    if (strings > 0) mppts.push({ stringsInParallel: strings, modulesPerString });
  }
  return mppts;
}

function fail(reason: string): BuildCandidateResult {
  return { ok: false, reason };
}

/**
 * One complete single-phase installation: `stringCount` strings of `modulesPerString` modules on
 * one inverter, with the smallest catalog protections and cable sections that pass their checks,
 * run through the full engine. The protections are shared by every MPPT, so they are sized for
 * the MPPT carrying the most strings (the first one).
 */
export function buildCandidate(
  module: CatalogModule,
  inverter: CatalogInverter,
  modulesPerString: number,
  stringCount: number,
  catalog: SizingCatalog,
  context: SizingContext,
): BuildCandidateResult {
  const mppts = spreadStrings(stringCount, inverter.mpptCount, modulesPerString);
  const maxStringsPerMppt = Math.max(...mppts.map((mppt) => mppt.stringsInParallel));
  if (maxStringsPerMppt > inverter.inputsPerMppt) {
    return fail(`Trop de chaînes pour l'onduleur ${inverter.brand} ${inverter.model}.`);
  }

  const stringVoc = stringVocTmin(module, modulesPerString, context.tMinC);
  const fieldCurrentA = iscFieldDesign(module, maxStringsPerMppt);

  const dcSwitch = smallestPassing(
    catalog.dcSwitches,
    (s) => s.ratedCurrentA,
    (s) => checkC09(s.ratedVoltageV, stringVoc, s.ratedCurrentA, fieldCurrentA).pass,
  );
  if (!dcSwitch) return fail('Aucun interrupteur-sectionneur DC compatible dans le catalogue.');

  const dcSpd = smallestPassing(
    catalog.spds.filter((s): s is DcSpd => s.side === 'DC' && s.iscpvKA !== null),
    (s) => s.ucV,
    (s) =>
      checkC10(s.ucV, modulesPerString, module.vocV, s.inKA, s.iscpvKA, fieldCurrentA).pass &&
      checkC11(s.upKV, EQUIPMENT_IMPULSE_WITHSTAND_KV, SPD_TO_EQUIPMENT_DISTANCE_M).pass,
  );
  if (!dcSpd) return fail('Aucun parafoudre DC compatible dans le catalogue.');

  let dcFuse: CatalogDcFuse | null = null;
  if (dcFuseRequired(module, maxStringsPerMppt)) {
    dcFuse = smallestPassing(
      catalog.dcFuses,
      (f) => f.ratedCurrentA,
      (f) => checkC08(dcFuseCheckInput(module, modulesPerString, maxStringsPerMppt, context.tMinC, f)).pass,
    );
    if (!dcFuse) return fail('Aucun fusible DC compatible dans le catalogue.');
  }

  const acSpd = smallestPassing(
    catalog.spds.filter((s) => s.side === 'AC'),
    (s) => s.ucV,
    (s) => checkC14(s.ucV).pass,
  );
  if (!acSpd) return fail('Aucun parafoudre AC compatible dans le catalogue.');

  // DC cable: the smallest section carrying the field current (C16) within the drop limit.
  const dcRuns = cableSections(catalog.cables, 'DC_SOLAR')
    .map((option) => ({ option, run: cableRun(option, context.dcLengthM, DC_INSTALL_METHOD, DC_AMBIENT_TEMP_C) }))
    .filter(({ run }) => checkC16(runIzCorrected(run), fieldCurrentA).pass);
  if (dcRuns.length === 0) return fail('Aucun câble DC compatible dans le catalogue.');
  const stringVmp = stringVmpStc(module, modulesPerString);
  const dc = dcRuns.find(({ run }) => {
    const dropV = duDcV(run.conductor, run.lengthM, run.sectionMm2, module.impA, maxStringsPerMppt);
    return duDcPct(dropV, stringVmp) <= context.maxVoltageDropPct;
  });
  if (!dc) {
    return fail(
      `Aucune section de câble DC ne respecte la chute de tension sur ${lengthFormat.format(context.dcLengthM)} m.`,
    );
  }

  // AC cable + breaker: the smallest section that some breaker fits (C13) within the drop limit.
  const acSections = cableSections(catalog.cables, 'AC');
  if (acSections.length === 0) return fail('Aucun câble AC compatible dans le catalogue.');
  const acRuns = acSections.flatMap((option) => {
    const run = cableRun(option, context.acLengthM, AC_INSTALL_METHOD, AC_AMBIENT_TEMP_C);
    const iz = runIzCorrected(run);
    const breaker = smallestPassing(
      catalog.acBreakers,
      (b) => b.ratedCurrentA,
      (b) => checkC13(inverter.iacMaxA, b.ratedCurrentA, iz).pass,
    );
    return breaker ? [{ option, run, breaker }] : [];
  });
  if (acRuns.length === 0) return fail('Aucun disjoncteur AC compatible dans le catalogue.');
  const ac = acRuns.find(({ run }) => {
    const dropV = duAcV(
      run.conductor,
      run.lengthM,
      run.sectionMm2,
      context.cosPhi,
      context.lambdaOhmPerM,
      inverter.iacMaxA,
      SITE_PHASES,
    );
    return duAcPct(dropV, SITE_PHASES) <= context.maxVoltageDropPct;
  });
  if (!ac) {
    return fail(
      `Aucune section de câble AC ne respecte la chute de tension sur ${lengthFormat.format(context.acLengthM)} m.`,
    );
  }

  const earthCable = catalog.cables.find(
    (cable) => cable.usage === 'EARTH' && cable.sections.some((s) => s.sectionMm2 === EARTH_SECTION_MM2),
  );
  if (!earthCable) return fail(`Aucun câble de terre de ${EARTH_SECTION_MM2} mm² dans le catalogue.`);

  const engineInput: RunEngineInput = {
    module,
    array: [{ inverter, mppts }],
    tMinC: context.tMinC,
    tMaxC: context.tMaxC,
    dcSwitch: { ratedVoltageV: dcSwitch.ratedVoltageV, ratedCurrentA: dcSwitch.ratedCurrentA },
    dcFuse: dcFuse ? { ratedCurrentA: dcFuse.ratedCurrentA, ratedVoltageV: dcFuse.ratedVoltageV } : null,
    dcSpd: { ucV: dcSpd.ucV, inKA: dcSpd.inKA, iscpvKA: dcSpd.iscpvKA, upKV: dcSpd.upKV, type: dcSpd.type },
    acBreaker: { ratedCurrentA: ac.breaker.ratedCurrentA },
    acSpd: { ucV: acSpd.ucV, upKV: acSpd.upKV, type: acSpd.type },
    acIsolator: null,
    equipmentImpulseWithstandKV: EQUIPMENT_IMPULSE_WITHSTAND_KV,
    spdToEquipmentDistanceM: SPD_TO_EQUIPMENT_DISTANCE_M,
    dcRun: dc.run,
    acRun: ac.run,
    cosPhi: context.cosPhi,
    lambdaOhmPerM: context.lambdaOhmPerM,
    maxVoltageDropPct: context.maxVoltageDropPct,
    structure: {
      ballastPerFrame: 0,
      ballastMassKg: 0,
      windSpeedKmh: context.windSpeedKmh,
      tiltDeg: context.tiltDeg,
    },
    site: { phases: SITE_PHASES, lightningRod: false, gps: context.gps },
    dossierDate: context.dossierDate,
    companyAccreditationValidTo: context.companyAccreditationValidTo,
    equipmentHomologationExpiries: [module.homologationValidTo, inverter.homologationValidTo],
    subscribedPowerKVA: context.subscribedPowerKVA,
  };

  const engineResult = runEngine(engineInput);
  const blocking = engineResult.checks.find((check) => check.level === 'BLOCK' && !check.pass);
  if (blocking) return fail(blocking.message);

  return {
    ok: true,
    candidate: {
      module,
      inverter,
      modulesPerString,
      stringCount,
      mppts,
      dcSwitchId: dcSwitch.id,
      dcFuseId: dcFuse?.id ?? null,
      dcSpdId: dcSpd.id,
      acBreakerId: ac.breaker.id,
      acSpdId: acSpd.id,
      dcCable: { cableId: dc.option.cable.id, sectionMm2: dc.option.section.sectionMm2, lengthM: context.dcLengthM },
      acCable: { cableId: ac.option.cable.id, sectionMm2: ac.option.section.sectionMm2, lengthM: context.acLengthM },
      earthCableId: earthCable.id,
      engineInput,
      engineResult,
    },
  };
}
