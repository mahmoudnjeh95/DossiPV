import type {
  Candidate,
  CatalogInverter,
  CatalogModule,
  Proposal,
  ProposalKind,
  ProposeResult,
  SizingCatalog,
  SizingContext,
} from './sizing-types';
import { buildCandidate } from './build-candidate';
import { nsMax, nsMin, nsOptMax, npOpt } from './string-sizing';
import { computeRowSpacingM } from './panel-layout';

/** Upper bound on buildCandidate calls (each one runs the full engine) per proposeInstallations call. */
export const MAX_ENGINE_RUNS = 20_000;
/**
 * Part of MAX_ENGINE_RUNS kept for the largest installations (phase 2), which sort last by
 * coverage distance and would otherwise never be built.
 */
export const MAX_PRODUCTION_RESERVE_RUNS = 2_000;
/** Upper bound on the string layouts enumerated (before any engine run) per proposeInstallations call. */
export const MAX_COMBOS = 200_000;

const MODULE_MIN_PMAX_W = 380;
const MODULE_MAX_PMAX_W = 720;
const MIN_DC_AC_RATIO = 0.8;
const MAX_DC_AC_RATIO = 1.3;
const MIN_COVERAGE = 0.5;
const ECONOMIC_MIN_COVERAGE = 0.8;
/** Tie-break target: the DC/AC ratio installers usually aim for. */
const PREFERRED_DC_AC_RATIO = 1.15;
const MAX_NO_SOLUTION_REASONS = 3;
/** Sanity bounds that keep the enumeration finite whatever the catalog holds. */
const MAX_MODULES_PER_STRING = 100;
const MAX_MPPT_COUNT = 16;
const MAX_INPUTS_PER_MPPT = 16;
const KIND_ORDER: ProposalKind[] = ['RECOMMENDED', 'ECONOMIC', 'MAX_PRODUCTION'];

const numberFormat = new Intl.NumberFormat('fr-FR');

interface Combo {
  module: CatalogModule;
  inverter: CatalogInverter;
  modulesPerString: number;
  stringCount: number;
  coverage: number;
}

/** A built candidate with the figures shown to the client. */
type Scored = Omit<Proposal, 'kinds' | 'explanation'>;

function isValidOn(validTo: string | null, date: string): boolean {
  return validTo === null || validTo >= date;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isCountUpTo(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

/** Electrical values the enumeration and the engine divide by or loop over: malformed ones are skipped. */
function hasUsableInverterValues(inverter: CatalogInverter): boolean {
  return (
    [
      inverter.pacW,
      inverter.vdcMaxV,
      inverter.mpptMinV,
      inverter.mpptMaxV,
      inverter.idcMaxPerMpptA,
    ].every(isPositiveFinite) &&
    isCountUpTo(inverter.mpptCount, MAX_MPPT_COUNT) &&
    isCountUpTo(inverter.inputsPerMppt, MAX_INPUTS_PER_MPPT)
  );
}

function hasUsableModuleValues(module: CatalogModule): boolean {
  return [
    module.pmaxW,
    module.vmpV,
    module.impA,
    module.vocV,
    module.iscA,
    module.lengthMm,
    module.widthMm,
  ].every(isPositiveFinite);
}

function eligibleInverters(catalog: SizingCatalog, context: SizingContext): CatalogInverter[] {
  return catalog.inverters.filter(
    (inverter) =>
      hasUsableInverterValues(inverter) &&
      inverter.phases === 1 &&
      inverter.stegApproved === true &&
      isValidOn(inverter.homologationValidTo, context.dossierDate) &&
      inverter.pacW <= context.subscribedPowerKVA * 1000,
  );
}

function eligibleModules(catalog: SizingCatalog, context: SizingContext): CatalogModule[] {
  return catalog.modules.filter(
    (module) =>
      hasUsableModuleValues(module) &&
      module.pmaxW >= MODULE_MIN_PMAX_W &&
      module.pmaxW <= MODULE_MAX_PMAX_W &&
      isValidOn(module.homologationValidTo, context.dossierDate),
  );
}

/**
 * Every string layout whose DC/AC ratio and coverage are plausible, before any engine run, up to
 * MAX_COMBOS. The loop bounds are clamped so the enumeration stays finite whatever the catalog
 * holds (a NaN bound simply yields no layout).
 */
function cheapCombos(
  modules: CatalogModule[],
  inverters: CatalogInverter[],
  context: SizingContext,
): Combo[] {
  const combos: Combo[] = [];
  for (const module of modules) {
    for (const inverter of inverters) {
      const nsLow = Math.max(1, nsMin(module, inverter, context.tMaxC));
      const nsHigh = Math.min(
        nsOptMax(module, inverter, context.tMinC),
        nsMax(module, inverter, context.tMinC),
        MAX_MODULES_PER_STRING,
      );
      const inputStrings =
        inverter.mpptCount *
        Math.min(inverter.inputsPerMppt, npOpt(module, inverter, context.tMaxC));
      for (let modulesPerString = nsLow; modulesPerString <= nsHigh; modulesPerString++) {
        // Beyond this many strings the DC/AC ratio exceeds its maximum.
        const ratioStrings = Math.ceil(
          (MAX_DC_AC_RATIO * inverter.pacW) / (modulesPerString * module.pmaxW),
        );
        const maxStrings = Math.min(inputStrings, ratioStrings);
        for (let stringCount = 1; stringCount <= maxStrings; stringCount++) {
          const dcW = modulesPerString * stringCount * module.pmaxW;
          const ratio = dcW / inverter.pacW;
          const coverage =
            ((dcW / 1000) * context.specificYieldKWhPerKWp) / context.annualConsumptionKWh;
          if (ratio < MIN_DC_AC_RATIO || ratio > MAX_DC_AC_RATIO) continue;
          if (coverage < MIN_COVERAGE) continue;
          combos.push({ module, inverter, modulesPerString, stringCount, coverage });
          if (combos.length >= MAX_COMBOS) return combos;
        }
      }
    }
  }
  return combos;
}

function score(candidate: Candidate, context: SizingContext): Scored {
  const { module, inverter, modulesPerString, stringCount } = candidate;
  const moduleCount = modulesPerString * stringCount;
  const dcPowerKWp = (moduleCount * module.pmaxW) / 1000;
  const annualProductionKWh = Math.round(dcPowerKWp * context.specificYieldKWhPerKWp);
  const lengthM = module.lengthMm / 1000;
  const tiltRad = (context.tiltDeg * Math.PI) / 180;
  const rowDepthM =
    lengthM * Math.cos(tiltRad) + computeRowSpacingM(context.tiltDeg, lengthM, context.gps.lat);
  const price = context.averagePriceTNDPerKWh;
  return {
    key: `${module.id}|${inverter.id}|${modulesPerString}x${stringCount}`,
    candidate,
    moduleCount,
    dcPowerKWp,
    acPowerKW: inverter.pacW / 1000,
    annualProductionKWh,
    coveragePct: Math.round((annualProductionKWh / context.annualConsumptionKWh) * 100),
    roofAreaM2: Math.round(moduleCount * (module.widthMm / 1000) * rowDepthM * 10) / 10,
    yearlySavingTND:
      price === null
        ? null
        : Math.round(Math.min(annualProductionKWh, context.annualConsumptionKWh) * price),
  };
}

function name(item: { brand: string; model: string }): string {
  return `${item.brand} ${item.model}`;
}

/** |DC/AC − 1.15|, rounded to 1e-9 so ratios symmetric around 1.15 tie despite float noise. */
function distanceToPreferredRatio(s: Scored): number {
  const ratio = (s.dcPowerKWp * 1000) / s.candidate.inverter.pacW;
  return Math.round(Math.abs(ratio - PREFERRED_DC_AC_RATIO) * 1e9);
}

/** Ties: DC/AC ratio closest to 1.15, then fewer modules, then brand/model alphabetical. */
function compareTies(a: Scored, b: Scored): number {
  return (
    distanceToPreferredRatio(a) - distanceToPreferredRatio(b) ||
    a.moduleCount - b.moduleCount ||
    name(a.candidate.module).localeCompare(name(b.candidate.module)) ||
    name(a.candidate.inverter).localeCompare(name(b.candidate.inverter)) ||
    a.key.localeCompare(b.key)
  );
}

/** The candidate minimizing `cost` (ties broken by compareTies), or null when none qualifies. */
function best(
  candidates: Scored[],
  qualifies: (s: Scored) => boolean,
  cost: (s: Scored) => number,
): Scored | null {
  let winner: Scored | null = null;
  for (const scored of candidates) {
    if (!qualifies(scored)) continue;
    if (
      winner === null ||
      cost(scored) < cost(winner) ||
      (cost(scored) === cost(winner) && compareTies(scored, winner) < 0)
    ) {
      winner = scored;
    }
  }
  return winner;
}

function explain(kind: ProposalKind, scored: Scored, context: SizingContext): string {
  switch (kind) {
    case 'RECOMMENDED':
      return `Production estimée la plus proche de la consommation (${scored.coveragePct} %).`;
    case 'ECONOMIC':
      return 'Le moins de panneaux pour couvrir au moins 80 % de la consommation.';
    case 'MAX_PRODUCTION':
      return `La plus forte production possible avec ${numberFormat.format(context.subscribedPowerKVA)} kVA souscrits (onduleur ≤ puissance souscrite, rapport DC/AC ≤ 1,3).`;
  }
}

/** The tallied reasons, most frequent first (first seen first on equal counts). */
function mostFrequent(tally: Map<string, number>): string[] {
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_NO_SOLUTION_REASONS)
    .map(([reason]) => reason);
}

function noSolution(reasons: string[], combinations = 0, engineRuns = 0): ProposeResult {
  return { proposals: [], noSolutionReasons: reasons, stats: { combinations, engineRuns } };
}

/**
 * Up to three single-phase installations from the installer's catalog for the client's need:
 * the one producing closest to the consumption (RECOMMENDED), the one with the fewest modules
 * covering at least 80 % (ECONOMIC) and the most productive one (MAX_PRODUCTION), limited only by
 * the subscribed power (inverter AC power) and the DC/AC ratio: there is no coverage ceiling. Objectives won by the same installation are merged into one proposal.
 * When nothing qualifies, `noSolutionReasons` says why, in French, for the installer.
 */
export function proposeInstallations(
  catalog: SizingCatalog,
  context: SizingContext,
): ProposeResult {
  const inverters = eligibleInverters(catalog, context);
  const modules = eligibleModules(catalog, context);
  const eligibilityReasons: string[] = [];
  if (inverters.length === 0) {
    eligibilityReasons.push(
      `Aucun onduleur monophasé homologué STEG de ${numberFormat.format(context.subscribedPowerKVA)} kVA ou moins dans le catalogue.`,
    );
  }
  if (modules.length === 0) {
    eligibilityReasons.push(
      `Aucun module homologué de ${MODULE_MIN_PMAX_W} à ${MODULE_MAX_PMAX_W} W dans le catalogue.`,
    );
  }
  if (eligibilityReasons.length > 0) return noSolution(eligibilityReasons);

  const combos = cheapCombos(modules, inverters, context);
  if (combos.length === 0) {
    return noSolution([
      'Aucune combinaison panneaux/onduleur ne couvre au moins 50 % de la consommation.',
    ]);
  }
  combos.sort((a, b) => Math.abs(a.coverage - 1) - Math.abs(b.coverage - 1));

  const candidates: Scored[] = [];
  const failures = new Map<string, number>();
  let engineRuns = 0;
  const build = (combo: Combo): boolean => {
    engineRuns++;
    const result = buildCandidate(
      combo.module,
      combo.inverter,
      combo.modulesPerString,
      combo.stringCount,
      catalog,
      context,
    );
    if (result.ok) {
      candidates.push(score(result.candidate, context));
      return true;
    }
    failures.set(result.reason, (failures.get(result.reason) ?? 0) + 1);
    return false;
  };

  // Phase 1: the combinations closest to the need, keeping a reserve for phase 2.
  const phase1Runs = Math.min(combos.length, MAX_ENGINE_RUNS - MAX_PRODUCTION_RESERVE_RUNS);
  for (let i = 0; i < phase1Runs; i++) build(combos[i] as Combo);

  // Phase 2: the largest installations not built yet, until one succeeds.
  const dcPowerW = (c: Combo): number => c.modulesPerString * c.stringCount * c.module.pmaxW;
  const comboKey = (c: Combo): string =>
    `${c.module.id}|${c.inverter.id}|${c.modulesPerString}x${c.stringCount}`;
  const remaining = combos
    .slice(phase1Runs)
    .sort((a, b) => dcPowerW(b) - dcPowerW(a) || comboKey(a).localeCompare(comboKey(b)));
  for (const combo of remaining) {
    if (engineRuns >= MAX_ENGINE_RUNS) break;
    if (build(combo)) break;
  }
  if (candidates.length === 0) return noSolution(mostFrequent(failures), combos.length, engineRuns);

  const consumption = context.annualConsumptionKWh;
  // A division (not `limit × consumption`) so an exact 80 % compares equal to the limit.
  const coverage = (s: Scored): number => s.annualProductionKWh / consumption;
  const winners: Record<ProposalKind, Scored | null> = {
    RECOMMENDED: best(
      candidates,
      () => true,
      (s) => Math.abs(s.annualProductionKWh - consumption),
    ),
    ECONOMIC: best(
      candidates,
      (s) => coverage(s) >= ECONOMIC_MIN_COVERAGE,
      (s) => s.moduleCount,
    ),
    MAX_PRODUCTION: best(
      candidates,
      () => true,
      (s) => -s.annualProductionKWh,
    ),
  };

  const proposals: Proposal[] = [];
  for (const kind of KIND_ORDER) {
    const winner = winners[kind];
    if (!winner) continue;
    const explanation = explain(kind, winner, context);
    const existing = proposals.find((p) => p.key === winner.key);
    if (existing) {
      existing.kinds.push(kind);
      existing.explanation = `${existing.explanation} ${explanation}`;
      continue;
    }
    proposals.push({ ...winner, kinds: [kind], explanation });
  }

  return { proposals, noSolutionReasons: [], stats: { combinations: combos.length, engineRuns } };
}
