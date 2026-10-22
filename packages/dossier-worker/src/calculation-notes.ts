import {
  checkC11,
  dcFuseCheckInput,
  impAtTmax,
  iscFieldDesign,
  resolveVmpTempCoeff,
  stringVocTmin,
  type CheckResult,
  type EngineResult,
  type MpptConfig,
  type RunEngineInput,
} from '@dossipv/engine';
import type { CalculationNote, ProtectionNote } from '@dossipv/docx-template';

/**
 * The dossier's calculation notes: every formula is the engine's own (module-electrical.ts,
 * string-sizing.ts, protections.ts, checks.ts), written with the engine's symbols; the
 * « Application numérique » substitutes the project's inputs; the result is the engine's derived
 * value, formatted — never a value recomputed here.
 */

/** An input as entered (up to 4 decimals), decimal comma. */
export function fr(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 }).format(value);
}

/** A computed value, 2 decimals, decimal comma. */
export function fr2(value: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** A negative input in parentheses, so `× (-0,25)` never reads as a subtraction. */
function signed(value: number): string {
  return value < 0 ? `(${fr(value)})` : fr(value);
}

/**
 * A quotient shown before `partie entière` (floor) or `partie entière supérieure` (ceil), rounded
 * in the operation's own direction so the printed 2-decimal figure always rounds to the printed
 * integer (9,047… shows 9,04 → 9, never 9,05; 2,581… shows 2,59 → 3).
 */
function quotient(value: number, direction: 'floor' | 'ceil'): string {
  const rounded = direction === 'floor' ? Math.floor(value * 100 + 1e-9) / 100 : Math.ceil(value * 100 - 1e-9) / 100;
  return fr2(rounded);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${fr(count)} ${count > 1 ? pluralForm : singular}`;
}

/** Every engine result carrying one of `ids` passed; an id the engine did not report counts as a failure. */
export function conformity(checks: CheckResult[], ids: string[]): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const id of ids) {
    const results = checks.filter((check) => check.id === id);
    if (results.length === 0) failures.push('règle non vérifiée par le calcul');
    for (const result of results) if (!result.pass) failures.push(result.message);
  }
  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

/** The C06 bounds (checks.ts: 0.9 <= POWER_RATIO <= 1.3). */
const POWER_RATIO_MIN = 0.9;
const POWER_RATIO_MAX = 1.3;

export function buildTemperatureAssumptions(engineInput: RunEngineInput): string {
  return `Tmin = ${fr(engineInput.tMinC)} °C, Tmax = ${fr(engineInput.tMaxC)} °C (hypothèses de calcul)`;
}

/** ` × (1 + Gbif/100)` when the module declares a bifacial gain (the engine's factor is 1 otherwise). */
function bifacialFactor(gainPct: number): { formula: string; application: string } {
  return gainPct === 0 ? { formula: '', application: '' } : { formula: ' × (1 + Gbif/100)', application: ` × (1 + ${fr(gainPct)}/100)` };
}

export interface StringSizingNotesInput {
  engineInput: RunEngineInput;
  engineResult: EngineResult;
  /** The fitted DC fuse as `brand model`; null when none. */
  dcFuseLabel: string | null;
}

/**
 * The 13 string sizing notes, for the project's (single) inverter: Voc(Tmin), Vmp(Tmin),
 * Vmp(Tmax), Isc(Tmax), Ns max, Ns min, Ns optimal max, Np max, Np optimal, Ns retenu, the DC/AC
 * power ratio, Ncmax and the DC fuse.
 */
export function buildStringSizingNotes({ engineInput, engineResult, dcFuseLabel }: StringSizingNotesInput): CalculationNote[] {
  const { module, tMinC, tMaxC } = engineInput;
  const inverter = engineInput.array[0]!.inverter;
  const mppts = engineInput.array[0]!.mppts;
  const d = engineResult.derived;
  const vocTmin = d.VOC_TMIN!;
  const vmpTmin = d.VMP_TMIN!;
  const vmpTmax = d.VMP_TMAX!;
  const iscTmax = d.ISC_TMAX!;
  const nsMax = d.NS_MAX!;
  const nsMin = d.NS_MIN!;
  const nsOptMax = d.NS_OPT_MAX!;
  const npMax = d.NP_MAX!;
  const npOpt = d.NP_OPT!;
  const ncMax = d.NC_MAX_NO_FUSE!;
  const vmpCoeff = resolveVmpTempCoeff(module);
  const bifacial = bifacialFactor(module.bifacialGainPct ?? 0);
  // NP_OPT's denominator (engine impAtTmax: the Isc coefficient and the bifacial gain).
  const impTmax = impAtTmax(module, tMaxC);
  const tempFactor = (coeff: number, t: number): string => `[1 + ${signed(coeff)}/100 × (${fr(t)} - 25)]`;

  const notes: CalculationNote[] = [
    {
      // module-electrical.ts vocAtTmin
      title: 'Tension de circuit ouvert du module à Tmin : Voc(Tmin)',
      formula: 'Voc(Tmin) = Voc × [1 + βVoc/100 × (Tmin - 25)]\nVoc : tension de circuit ouvert du module aux STC ; βVoc : coefficient de température de Voc (%/°C)',
      application: `Voc(Tmin) = ${fr(module.vocV)} × ${tempFactor(module.tempCoeffVocPct, tMinC)} = ${fr2(vocTmin)} V`,
      result: `Voc(Tmin) = ${fr2(vocTmin)} V`,
      conclusion: null,
    },
    {
      // module-electrical.ts vmpAtTmin (coefficient: resolveVmpTempCoeff)
      title: 'Tension au point de puissance maximale à Tmin : Vmp(Tmin)',
      formula: `Vmp(Tmin) = Vmp × [1 + βVmp/100 × (Tmin - 25)]\n${vmpCoefficientLegend(module.tempCoeffVmpPct !== undefined)}`,
      application: `Vmp(Tmin) = ${fr(module.vmpV)} × ${tempFactor(vmpCoeff, tMinC)} = ${fr2(vmpTmin)} V`,
      result: `Vmp(Tmin) = ${fr2(vmpTmin)} V`,
      conclusion: null,
    },
    {
      // module-electrical.ts vmpAtTmax
      title: 'Tension au point de puissance maximale à Tmax : Vmp(Tmax)',
      formula: `Vmp(Tmax) = Vmp × [1 + βVmp/100 × (Tmax - 25)]\n${vmpCoefficientLegend(module.tempCoeffVmpPct !== undefined)}`,
      application: `Vmp(Tmax) = ${fr(module.vmpV)} × ${tempFactor(vmpCoeff, tMaxC)} = ${fr2(vmpTmax)} V`,
      result: `Vmp(Tmax) = ${fr2(vmpTmax)} V`,
      conclusion: null,
    },
    {
      // module-electrical.ts iscAtTmax
      title: 'Courant de court-circuit du module à Tmax : Isc(Tmax)',
      formula: `Isc(Tmax) = Isc × [1 + αIsc/100 × (Tmax - 25)]${bifacial.formula}\nIsc : courant de court-circuit du module aux STC ; αIsc : coefficient de température de Isc (%/°C)${bifacial.formula ? ' ; Gbif : gain bifacial (%)' : ''}`,
      application: `Isc(Tmax) = ${fr(module.iscA)} × ${tempFactor(module.tempCoeffIscPct, tMaxC)}${bifacial.application} = ${fr2(iscTmax)} A`,
      result: `Isc(Tmax) = ${fr2(iscTmax)} A`,
      conclusion: null,
    },
    {
      // string-sizing.ts nsMax
      title: 'Nombre maximal de modules en série : Ns max',
      formula: "Ns max = partie entière de [Vdc max / Voc(Tmin)]\nVdc max : tension d'entrée DC maximale de l'onduleur",
      application: `Ns max = partie entière de (${fr(inverter.vdcMaxV)} / ${fr2(vocTmin)}) = partie entière de ${quotient(inverter.vdcMaxV / vocTmin, 'floor')} = ${fr(nsMax)}`,
      result: `Ns max = ${plural(nsMax, 'module', 'modules')}`,
      conclusion: null,
    },
    {
      // string-sizing.ts nsMin
      title: 'Nombre minimal de modules en série : Ns min',
      formula: "Ns min = partie entière supérieure de [max(Umppt min ; Udém) / Vmp(Tmax)]\nUmppt min : tension minimale de la plage MPPT ; Udém : tension de démarrage de l'onduleur",
      application: `Ns min = partie entière supérieure de (max(${fr(inverter.mpptMinV)} ; ${fr(inverter.startUpV)}) / ${fr2(vmpTmax)}) = partie entière supérieure de ${quotient(Math.max(inverter.mpptMinV, inverter.startUpV) / vmpTmax, 'ceil')} = ${fr(nsMin)}`,
      result: `Ns min = ${plural(nsMin, 'module', 'modules')}`,
      conclusion: null,
    },
    {
      // string-sizing.ts nsOptMax
      title: 'Nombre optimal maximal de modules en série : Ns optimal max',
      formula: 'Ns optimal max = partie entière de [Umppt max / Vmp(Tmin)]\nUmppt max : tension maximale de la plage MPPT',
      application: `Ns optimal max = partie entière de (${fr(inverter.mpptMaxV)} / ${fr2(vmpTmin)}) = partie entière de ${quotient(inverter.mpptMaxV / vmpTmin, 'floor')} = ${fr(nsOptMax)}`,
      result: `Ns optimal max = ${plural(nsOptMax, 'module', 'modules')}`,
      conclusion: null,
    },
    {
      // string-sizing.ts npMax
      title: 'Nombre maximal de chaînes en parallèle : Np max',
      formula: 'Np max = partie entière de [Isc max MPPT / Isc(Tmax)]\nIsc max MPPT : courant de court-circuit maximal admissible par entrée MPPT',
      application: `Np max = partie entière de (${fr(inverter.iscMaxPerMpptA)} / ${fr2(iscTmax)}) = partie entière de ${quotient(inverter.iscMaxPerMpptA / iscTmax, 'floor')} = ${fr(npMax)}`,
      result: `Np max = ${plural(npMax, 'chaîne', 'chaînes')}`,
      conclusion: null,
    },
    {
      // string-sizing.ts npOpt, module-electrical.ts impAtTmax
      title: 'Nombre optimal de chaînes en parallèle : Np optimal',
      formula: `Np optimal = partie entière de [Idc max MPPT / Imp(Tmax)], avec Imp(Tmax) = Imp × [1 + αIsc/100 × (Tmax - 25)]${bifacial.formula}\nIdc max MPPT : courant d'entrée maximal par MPPT ; Imp : courant au point de puissance maximale du module aux STC`,
      application: [
        `Imp(Tmax) = ${fr(module.impA)} × ${tempFactor(module.tempCoeffIscPct, tMaxC)}${bifacial.application} = ${fr2(impTmax)} A`,
        `Np optimal = partie entière de (${fr(inverter.idcMaxPerMpptA)} / ${fr2(impTmax)}) = partie entière de ${quotient(inverter.idcMaxPerMpptA / impTmax, 'floor')} = ${fr(npOpt)}`,
      ].join('\n'),
      result: `Np optimal = ${plural(npOpt, 'chaîne', 'chaînes')}`,
      conclusion: null,
    },
    nsRetainedNote(mppts.map((mppt) => mppt.modulesPerString), { nsMin, nsMax, nsOptMax }, engineResult.checks),
    powerRatioNote(engineInput, engineResult),
    {
      // protections.ts ncMaxNoFuse
      title: 'Nombre maximal de chaînes sans protection (Ncmax)',
      formula: 'Ncmax = partie entière de (1 + IRM / Isc) (UTE C15-712-1)\nIRM : courant inverse maximal admissible par le module ; Isc : courant de court-circuit du module aux STC',
      application: `Ncmax = partie entière de (1 + ${fr(module.irmA)} / ${fr(module.iscA)}) = partie entière de ${quotient(1 + module.irmA / module.iscA, 'floor')} = ${fr(ncMax)}`,
      result: `Ncmax = ${plural(ncMax, 'chaîne', 'chaînes')}`,
      conclusion: null,
    },
    dcFuseNote(engineInput, engineResult, dcFuseLabel),
  ];
  return notes;
}

function vmpCoefficientLegend(fromVmp: boolean): string {
  return fromVmp
    ? 'Vmp : tension au point de puissance maximale du module aux STC ; βVmp : coefficient de température de Vmp (%/°C)'
    : 'Vmp : tension au point de puissance maximale du module aux STC ; βVmp : coefficient de température de Vmp, pris égal à celui de Pmax faute de valeur du fabricant (%/°C)';
}

/** `5`, or `5 et 6` when the MPPTs carry different string lengths. */
function listText(values: number[]): string {
  return [...new Set(values)].sort((a, b) => a - b).map(fr).join(' et ');
}

/** Checks C01 (Ns <= NS_MAX), C02 (Ns >= NS_MIN) and C03 (Ns <= NS_OPT_MAX) on the retained string length. */
function nsRetainedNote(
  nsValues: number[],
  bounds: { nsMin: number; nsMax: number; nsOptMax: number },
  checks: CheckResult[],
): CalculationNote {
  const upper = Math.min(bounds.nsMax, bounds.nsOptMax);
  const ns = listText(nsValues);
  const pass = Math.max(...nsValues) <= upper && Math.min(...nsValues) >= bounds.nsMin;
  const { failures } = conformity(checks, ['C01', 'C02', 'C03']);
  return {
    title: 'Ns retenu',
    formula: 'Ns min ≤ Ns ≤ min(Ns max ; Ns optimal max)',
    application: `${fr(bounds.nsMin)} ≤ ${ns} ≤ min(${fr(bounds.nsMax)} ; ${fr(bounds.nsOptMax)}) = ${fr(upper)}`,
    result: `Ns = ${ns} modules en série par chaîne`,
    conclusion: pass
      ? `Ns retenu = ${ns} ≤ min(Ns max, Ns optimal max) = ${fr(upper)} et ≥ Ns min = ${fr(bounds.nsMin)} : condition vérifiée.`
      : `Ns retenu = ${ns} hors de l'intervalle [Ns min ; min(Ns max, Ns optimal max)] = [${fr(bounds.nsMin)} ; ${fr(upper)}] : condition non vérifiée${failures.length > 0 ? ` (${failures.join(' ; ')})` : ''}.`,
  };
}

/** string-sizing.ts powerRatio (P_DC_W / sum of the inverters' Pac), bounded by check C06. */
function powerRatioNote(engineInput: RunEngineInput, engineResult: EngineResult): CalculationNote {
  const ratio = engineResult.derived.POWER_RATIO!;
  const moduleCount = engineResult.derived.MODULE_COUNT!;
  const totalPacW = engineInput.array.reduce((sum, entry) => sum + entry.inverter.pacW, 0);
  const pacTerms = engineInput.array.length > 1 ? `(${engineInput.array.map((entry) => fr(entry.inverter.pacW)).join(' + ')})` : fr(totalPacW);
  const { pass, failures } = conformity(engineResult.checks, ['C06']);
  const bounds = `${fr(POWER_RATIO_MIN)} ≤ ${fr2(ratio)} ≤ ${fr(POWER_RATIO_MAX)}`;
  return {
    title: 'Rapport de puissance DC/AC',
    formula: `Rapport DC/AC = P DC / Pac = (N modules × Pmax) / Pac onduleur\nPlage admise : ${fr(POWER_RATIO_MIN)} ≤ Rapport DC/AC ≤ ${fr(POWER_RATIO_MAX)}`,
    application: `Rapport DC/AC = (${fr(moduleCount)} × ${fr(engineInput.module.pmaxW)}) / ${pacTerms} = ${fr2(ratio)}`,
    result: `Rapport DC/AC = ${fr2(ratio)}`,
    conclusion: pass ? `${bounds} : condition vérifiée.` : `Rapport DC/AC = ${fr2(ratio)} hors de la plage ${fr(POWER_RATIO_MIN)} – ${fr(POWER_RATIO_MAX)} : condition non vérifiée (${failures.join(' ; ')}).`,
  };
}

/**
 * protections.ts dcFuseRequired / dcFuseCheckInput and check C08, on the MPPT carrying the most
 * strings in parallel (the one a fuse requirement is decided by).
 */
function dcFuseNote(engineInput: RunEngineInput, engineResult: EngineResult, dcFuseLabel: string | null): CalculationNote {
  const { module, tMinC } = engineInput;
  const ncMax = engineResult.derived.NC_MAX_NO_FUSE!;
  const mppt = engineInput.array.flatMap((entry) => entry.mppts).reduce((worst, candidate) => (candidate.stringsInParallel > worst.stringsInParallel ? candidate : worst));
  const np = mppt.stringsInParallel;
  const fuse = dcFuseCheckInput(module, mppt.modulesPerString, np, tMinC, engineInput.dcFuse);
  const formula =
    'Un fusible par chaîne est requis si Np > Ncmax (UTE C15-712-1).\nCalibre du fusible : 1,1 × 1,25 × Isc ≤ In fusible ≤ IRM ; Un fusible ≥ Ns × Voc(Tmin)';
  if (!fuse.fuseRequired) {
    return {
      title: 'Fusible DC',
      formula,
      application: `Np = ${fr(np)} ≤ Ncmax = ${fr(ncMax)}`,
      result: 'Aucun fusible DC requis',
      conclusion: `Pas de fusible : ${fr(np)} chaîne(s) par MPPT ≤ Ncmax = ${fr(ncMax)}.`,
    };
  }
  const stringVoc = stringVocTmin(module, mppt.modulesPerString, tMinC);
  const application = [
    `Np = ${fr(np)} > Ncmax = ${fr(ncMax)} : fusible requis`,
    `1,1 × 1,25 × Isc = 1,1 × 1,25 × ${fr(module.iscA)} = ${fr2(fuse.lowerBoundA)} A ≤ In fusible ≤ IRM = ${fr(fuse.upperBoundA)} A`,
    `Un fusible ≥ Ns × Voc(Tmin) = ${fr(mppt.modulesPerString)} × ${fr2(engineResult.derived.VOC_TMIN!)} = ${fr2(stringVoc)} V`,
  ].join('\n');
  if (engineInput.dcFuse === null) {
    return { title: 'Fusible DC', formula, application, result: 'Aucun fusible DC installé', conclusion: 'Fusible DC requis mais absent : condition non vérifiée.' };
  }
  const { ratedCurrentA, ratedVoltageV } = engineInput.dcFuse;
  const { pass, failures } = conformity(engineResult.checks, ['C08']);
  const rule = `${fr2(fuse.lowerBoundA)} A ≤ In = ${fr(ratedCurrentA)} A ≤ ${fr(fuse.upperBoundA)} A et Un = ${fr(ratedVoltageV)} V ≥ ${fr2(stringVoc)} V`;
  const fuseName = dcFuseLabel ? `Fusible DC ${dcFuseLabel}` : 'Fusible DC';
  return {
    title: 'Fusible DC',
    formula,
    application,
    result: `In fusible = ${fr(ratedCurrentA)} A ; Un fusible = ${fr(ratedVoltageV)} V`,
    conclusion: pass ? `${fuseName} : ${rule} : condition vérifiée.` : `${fuseName} : condition non vérifiée (${failures.join(' ; ')}).`,
  };
}

// ---------------------------------------------------------------------------------------------
// Protection sizing notes (Task 20): the requirements of checks C09–C15 and C24, the numbers they
// are checked with, and the device fitted.
// ---------------------------------------------------------------------------------------------

/** Check C14: the AC SPD's Uc against 1.1 × 230 V (checks.ts). */
const AC_SPD_UC_FACTOR = 1.1;
const AC_NOMINAL_VOLTAGE_V = 230;
/** The minimum nominal discharge current of a surge arrester (check C10, DC side). */
const SPD_MIN_IN_KA = 5;
/** Check C11: Up < 0.8 × Uw, or 0.5 × Uw when the SPD is more than 10 m from the equipment. */
const SPD_DISTANCE_LIMIT_M = 10;

export interface ProtectionNotesInput {
  engineInput: RunEngineInput;
  engineResult: EngineResult;
  /** Each fitted protection as `brand model` (projectMeta.protections). */
  labels: { dcSwitch: string; dcSpd: string; acBreaker: string; acSpd: string };
  /** The AC SPD's nominal discharge current (kA) from its catalog row; null when unknown. */
  acSpdInKA: number | null;
}

/** `Le parafoudre DC choisi est conforme.`, or the failed rules. */
function conformityConclusion(device: string, result: { pass: boolean; failures: string[] }): string {
  return result.pass ? `${device} choisi est conforme.` : `${device} choisi n'est pas conforme : ${result.failures.join(' ; ')}.`;
}

/** An SPD current in kA, or in A below 1 kA (Iscpv is often a few tens of amperes). */
function kiloAmperes(valueKA: number): string {
  return valueKA < 1 ? `${fr(valueKA * 1000)} A` : `${fr(valueKA)} kA`;
}

/** The surge arrester type rule of check C12. */
function spdTypeRequirement(lightningRod: boolean): string {
  return lightningRod ? "Bâtiment équipé d'un paratonnerre : type 1" : 'Pas de paratonnerre : type 2';
}

/** The MPPT with the most modules in series (highest string voltage) and the one with the most strings in parallel (highest current). */
function worstMppts(engineInput: RunEngineInput): { longest: MpptConfig; widest: MpptConfig } {
  const mppts = engineInput.array.flatMap((entry) => entry.mppts);
  return {
    longest: mppts.reduce((worst, mppt) => (mppt.modulesPerString > worst.modulesPerString ? mppt : worst)),
    widest: mppts.reduce((worst, mppt) => (mppt.stringsInParallel > worst.stringsInParallel ? mppt : worst)),
  };
}

/** The Up rule of check C11, with the factor that applies to this project's SPD distance. */
function upLimit(engineInput: RunEngineInput): { limitKV: number; application: string } {
  const withstandKV = engineInput.equipmentImpulseWithstandKV;
  const factor = engineInput.spdToEquipmentDistanceM > SPD_DISTANCE_LIMIT_M ? 0.5 : 0.8;
  const limitKV = factor * withstandKV;
  return { limitKV, application: `Up < ${fr(factor)} × tenue aux chocs (${fr(withstandKV)} kV) = ${fr2(limitKV)} kV` };
}

const UP_RULE = `Up < 0,8 × Uw (0,5 × Uw si le parafoudre est à plus de ${SPD_DISTANCE_LIMIT_M} m de l'équipement protégé) ; Uw : tenue aux chocs des équipements`;

/** The field design current 1,25 × Isc × Np (× the bifacial gain): protections.ts iscFieldDesign (ISC_FIELD_DESIGN). */
function designCurrent(engineInput: RunEngineInput, np: number): { formula: string; application: string; valueA: number } {
  const { module } = engineInput;
  const bifacial = bifacialFactor(module.bifacialGainPct ?? 0);
  const valueA = iscFieldDesign(module, np);
  return {
    formula: `1,25 × Isc × Np${bifacial.formula}`,
    application: `1,25 × Isc × Np${bifacial.formula} = 1,25 × ${fr(module.iscA)} × ${fr(np)}${bifacial.application} = ${fr2(valueA)} A`,
    valueA,
  };
}

/** The 5 protection sizing notes, in the order of the reference dossier. */
export function buildProtectionNotes(input: ProtectionNotesInput): ProtectionNote[] {
  return [dcSwitchNote(input), dcSpdNote(input), acBreakerNote(input), acSpdNote(input), acDisconnectionNote(input)];
}

/** Check C09: dcSwitch.ratedVoltageV >= STRING_VOC_TMIN and dcSwitch.ratedCurrentA >= ISC_FIELD_DESIGN. */
function dcSwitchNote({ engineInput, engineResult, labels }: ProtectionNotesInput): ProtectionNote {
  const { longest, widest } = worstMppts(engineInput);
  const vocTmin = engineResult.derived.VOC_TMIN!;
  const stringVoc = stringVocTmin(engineInput.module, longest.modulesPerString, engineInput.tMinC);
  const current = designCurrent(engineInput, widest.stringsInParallel);
  const { ratedVoltageV, ratedCurrentA } = engineInput.dcSwitch;
  return {
    title: 'Interrupteur-sectionneur DC',
    formula: `Ue ≥ Voc(Tmin) de la chaîne = Ns × Voc(Tmin)\nIn ≥ courant de conception du champ = ${current.formula} (UTE C15-712-1)`,
    application: [`Ns × Voc(Tmin) = ${fr(longest.modulesPerString)} × ${fr2(vocTmin)} = ${fr2(stringVoc)} V`, current.application].join('\n'),
    result: `Ue = ${fr(ratedVoltageV)} V ≥ ${fr2(stringVoc)} V ; In = ${fr(ratedCurrentA)} A ≥ ${fr2(current.valueA)} A`,
    chosen: `${labels.dcSwitch} — ${fr(ratedVoltageV)} V, ${fr(ratedCurrentA)} A`,
    conclusion: conformityConclusion("L'interrupteur-sectionneur DC", conformity(engineResult.checks, ['C09'])),
  };
}

/** Checks C10 (Ucpv, In, Iscpv), C11 (Up) and C12 (type). */
function dcSpdNote({ engineInput, engineResult, labels }: ProtectionNotesInput): ProtectionNote {
  const { module } = engineInput;
  const { longest, widest } = worstMppts(engineInput);
  const spd = engineInput.dcSpd;
  const ucMin = 1.2 * longest.modulesPerString * module.vocV;
  const current = designCurrent(engineInput, widest.stringsInParallel);
  const up = upLimit(engineInput);
  return {
    title: 'Parafoudre DC',
    formula: [
      'Type 1 si le bâtiment est équipé d\'un paratonnerre, sinon type 2',
      'Ucpv ≥ 1,2 × Ns × Voc (Voc du module aux STC)',
      UP_RULE,
      `In ≥ ${SPD_MIN_IN_KA} kA`,
      `Iscpv ≥ courant de conception du champ = ${current.formula} (UTE C15-712-1)`,
    ].join('\n'),
    application: [
      spdTypeRequirement(engineInput.site.lightningRod),
      `1,2 × Ns × Voc = 1,2 × ${fr(longest.modulesPerString)} × ${fr(module.vocV)} = ${fr2(ucMin)} V`,
      up.application,
      current.application,
    ].join('\n'),
    result: [
      `Type ${fr(spd.type)}`,
      `Ucpv = ${fr(spd.ucV)} V ≥ ${fr2(ucMin)} V`,
      `Up = ${fr(spd.upKV)} kV < ${fr2(up.limitKV)} kV`,
      `In = ${fr(spd.inKA)} kA ≥ ${SPD_MIN_IN_KA} kA`,
      `Iscpv = ${kiloAmperes(spd.iscpvKA)} ≥ ${fr2(current.valueA)} A`,
    ].join('\n'),
    chosen: `${labels.dcSpd} — type ${fr(spd.type)}, Ucpv ${fr(spd.ucV)} V, Up ${fr(spd.upKV)} kV, In ${fr(spd.inKA)} kA, Iscpv ${kiloAmperes(spd.iscpvKA)}`,
    conclusion: conformityConclusion('Le parafoudre DC', conformity(engineResult.checks, ['C10', 'C11', 'C12'])),
  };
}

/** `30 mA type A`, or a plain breaker. */
function residualText(engineInput: RunEngineInput): string | null {
  const rcd = engineInput.rcd;
  return rcd && rcd.residualCurrentMA !== null && rcd.rcdType !== null ? `${fr(rcd.residualCurrentMA)} mA type ${rcd.rcdType}` : null;
}

/** Check C13 (Iac max <= In <= Iz' of the AC run) and C24 (30 mA type A or F, B). */
function acBreakerNote({ engineInput, engineResult, labels }: ProtectionNotesInput): ProtectionNote {
  const iacMaxA = Math.max(...engineInput.array.map((entry) => entry.inverter.iacMaxA));
  const izA = engineResult.derived.AC_RUN_IZ_CORRECTED!;
  const ratedA = engineInput.acBreaker.ratedCurrentA;
  const residual = residualText(engineInput);
  return {
    title: 'Disjoncteur différentiel AC',
    formula: [
      "Iac max onduleur ≤ In ≤ Iz' câble AC (NF C 15-100)",
      "Iz' : courant admissible du câble AC après facteurs de correction",
      'Protection différentielle : 30 mA type A (ou F, B)',
    ].join('\n'),
    application: `Iac max onduleur = ${fr(iacMaxA)} A ; Iz' câble AC (${fr(engineInput.acRun.sectionMm2)} mm²) = ${fr2(izA)} A\n${fr(iacMaxA)} A ≤ In ≤ ${fr2(izA)} A`,
    result: `In = ${fr(ratedA)} A ; ${residual ? `IΔn = ${residual}` : 'pas de fonction différentielle'}`,
    chosen: `${labels.acBreaker} — ${fr(ratedA)} A${residual ? `, ${residual}` : ''}`,
    conclusion: conformityConclusion('Le disjoncteur différentiel AC', conformity(engineResult.checks, ['C13', 'C24'])),
  };
}

/**
 * Checks C14 (Uc) and C12 (type). The engine checks Up (C11) on the DC SPD only, and In ≥ 5 kA on
 * the DC SPD only (C10): the AC SPD's Up is checked here with the same engine function (checkC11)
 * and its In with the same 5 kA threshold.
 */
function acSpdNote({ engineInput, engineResult, labels, acSpdInKA }: ProtectionNotesInput): ProtectionNote {
  const spd = engineInput.acSpd;
  const ucMin = AC_SPD_UC_FACTOR * AC_NOMINAL_VOLTAGE_V;
  const up = upLimit(engineInput);
  const engineChecks = conformity(engineResult.checks, ['C14', 'C12']);
  const upCheck = checkC11(spd.upKV, engineInput.equipmentImpulseWithstandKV, engineInput.spdToEquipmentDistanceM);
  const failures = [...engineChecks.failures];
  if (!upCheck.pass) failures.push(upCheck.message);
  if (acSpdInKA === null) failures.push('courant nominal de décharge In non renseigné');
  else if (acSpdInKA < SPD_MIN_IN_KA) failures.push(`courant nominal de décharge In inférieur à ${SPD_MIN_IN_KA} kA`);
  const inText = acSpdInKA === null ? 'In non renseigné' : `In = ${fr(acSpdInKA)} kA ≥ ${SPD_MIN_IN_KA} kA`;
  return {
    title: 'Parafoudre AC',
    formula: [
      "Type 1 si le bâtiment est équipé d'un paratonnerre, sinon type 2",
      `Uc ≥ ${fr(AC_SPD_UC_FACTOR)} × Un, Un = ${AC_NOMINAL_VOLTAGE_V} V (NF C 15-100)`,
      UP_RULE,
      `In ≥ ${SPD_MIN_IN_KA} kA`,
    ].join('\n'),
    application: [
      spdTypeRequirement(engineInput.site.lightningRod),
      `${fr(AC_SPD_UC_FACTOR)} × Un = ${fr(AC_SPD_UC_FACTOR)} × ${AC_NOMINAL_VOLTAGE_V} = ${fr2(ucMin)} V`,
      up.application,
    ].join('\n'),
    result: [`Type ${fr(spd.type)}`, `Uc = ${fr(spd.ucV)} V ≥ ${fr2(ucMin)} V`, `Up = ${fr(spd.upKV)} kV < ${fr2(up.limitKV)} kV`, inText].join('\n'),
    chosen: `${labels.acSpd} — type ${fr(spd.type)}, Uc ${fr(spd.ucV)} V, Up ${fr(spd.upKV)} kV${acSpdInKA === null ? '' : `, In ${fr(acSpdInKA)} kA`}`,
    conclusion: conformityConclusion('Le parafoudre AC', { pass: failures.length === 0, failures }),
  };
}

/**
 * Check C15: more than one inverter needs a general AC isolator rated above the sum of the
 * inverters' Iac max; with one inverter the differential breaker is the AC disconnecting device
 * (no AC isolator, user ruling 2026-10-22).
 */
function acDisconnectionNote({ engineInput, engineResult, labels }: ProtectionNotesInput): ProtectionNote {
  const inverterCount = engineInput.array.length;
  const formula = [
    'Plusieurs onduleurs : interrupteur-sectionneur général AC, In > Σ Iac max des onduleurs',
    'Un seul onduleur : le sectionnement côté AC est assuré par le disjoncteur différentiel',
  ].join('\n');
  const breaker = `${labels.acBreaker} — ${fr(engineInput.acBreaker.ratedCurrentA)} A${residualText(engineInput) ? `, ${residualText(engineInput)}` : ''}`;
  if (inverterCount <= 1) {
    return {
      title: 'Sectionnement AC',
      formula,
      application: "Nombre d'onduleurs = 1",
      result: "Pas d'interrupteur-sectionneur AC dédié",
      chosen: breaker,
      conclusion: `Un seul onduleur : pas d'interrupteur-sectionneur AC dédié ; le sectionnement côté AC est assuré par le disjoncteur différentiel ${labels.acBreaker}.`,
    };
  }
  const sumIacA = engineInput.array.reduce((sum, entry) => sum + entry.inverter.iacMaxA, 0);
  const isolatorA = engineInput.acIsolator?.ratedCurrentA ?? null;
  return {
    title: 'Sectionnement AC',
    formula,
    application: `Nombre d'onduleurs = ${fr(inverterCount)} ; Σ Iac max = ${engineInput.array.map((entry) => fr(entry.inverter.iacMaxA)).join(' + ')} = ${fr(sumIacA)} A`,
    result: isolatorA === null ? "Aucun interrupteur-sectionneur AC" : `In = ${fr(isolatorA)} A > ${fr(sumIacA)} A`,
    chosen: isolatorA === null ? '—' : `Interrupteur-sectionneur AC — ${fr(isolatorA)} A`,
    conclusion: conformityConclusion("L'interrupteur-sectionneur AC", conformity(engineResult.checks, ['C15'])),
  };
}
