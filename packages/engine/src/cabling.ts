import {
  RHO_CU,
  RHO_AL,
  K1_BY_METHOD,
  K2_TRAY_PERFORATED_E_F,
  K2_ENCLOSED_B_C,
  K3_PR,
  K3_PVC,
  K4_LAYERS,
} from './constants';

export type ReferenceMethod = 'B' | 'C' | 'E' | 'F';
export type InsulationType = 'PR' | 'PVC' | 'EPR' | 'XLPO';
export type ConductorType = 'Cu' | 'Al';

/**
 * Thrown by izCorrected when installMethod is a schema-valid CableRun.installMethod value
 * (per pv_dossier_input_schema.json's enum) that nonetheless has no K1 correction factor
 * tabled in K1_BY_METHOD (e.g. '21', '22', '61', '62', '63'). Rather than silently assuming
 * no derating (K1 = 1.0, the unsafe direction), this forces a human to supply the correct
 * NF C 15-100 table 52C factor before the run can proceed — similar in spirit to
 * MissingStabilityCoefficientsError in structure.ts.
 */
export class UnsupportedInstallMethodError extends Error {
  constructor(installMethod: string) {
    super(
      `Install method '${installMethod}' is valid per the schema but has no K1 derating ` +
        `factor tabled in K1_BY_METHOD. Supply the correct NF C 15-100 table 52C factor for ` +
        `this method before this project can be generated.`,
    );
    this.name = 'UnsupportedInstallMethodError';
  }
}

function resistivityFor(conductor: ConductorType): number {
  return conductor === 'Cu' ? RHO_CU : RHO_AL;
}

/**
 * Nearest table key at or below the given ambient temperature, matching the K3 tables' step
 * gaps. When ambientTempC exceeds every key in the table, this naturally resolves to the
 * table's highest (hottest, most conservative) key, since there is no higher key available to
 * prefer instead — verified by trace for K3_PVC (max key 60) with ambientTempC=80: the loop's
 * `key <= ambientTempC` condition is satisfied by every key including 60, so `chosen` ends at 60.
 * Symmetrically, when ambientTempC is below every key in the table, `chosen` stays at its
 * initial value `keys[0]` (the lowest, least conservative key) — still a real key present in
 * the table, never undefined — verified by trace for K3_PR (min key 10) with ambientTempC=5:
 * no key satisfies `key <= 5`, so the loop never reassigns `chosen` and it returns '10'.
 */
function nearestTempKey(table: Record<string, number>, ambientTempC: number): string {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  let chosen = keys[0];
  for (const key of keys) {
    if (key <= ambientTempC) {
      chosen = key;
    }
  }
  return String(chosen);
}

/**
 * Clamps a layer count to the K4_LAYERS table's highest tabled key when it exceeds every key
 * present, returning that key's (worst-case, most conservative) factor instead of silently
 * falling back to 1.0 (no correction — the unsafe direction for an ampacity derating factor).
 */
function k4ForLayers(layers: number): number {
  const keys = Object.keys(K4_LAYERS)
    .map(Number)
    .sort((a, b) => a - b);
  const maxKey = keys[keys.length - 1] ?? layers;
  const clampedLayers = Math.min(layers, maxKey);
  return K4_LAYERS[String(clampedLayers)] ?? 1.0;
}

/** The four NF C 15-100 correction factors applied to a cable's reference Iz. */
export interface IzCorrectionFactors {
  /** Install method (K1_BY_METHOD). */
  k1: number;
  /** Grouping of circuits side by side (K2 tables). */
  k2: number;
  /** Ambient temperature and insulation (K3 tables). */
  k3: number;
  /** Number of layers (K4_LAYERS). */
  k4: number;
}

/**
 * The correction factors of IZ_CORRECTED, so the dossier can print each one.
 * K1 from install method (K1_BY_METHOD). K2 from grouped circuits, using the tray table for
 * reference methods E/F (perforated) and the enclosed table for B/C.
 * K3 from ambient temperature and insulation — schema note: PR/EPR/XLPO all use the PR column.
 * K4 from layer count.
 */
export function izCorrectionFactors(
  installMethod: string,
  referenceMethod: ReferenceMethod,
  groupedCircuits: number,
  layers: number,
  ambientTempC: number,
  insulation: InsulationType,
): IzCorrectionFactors {
  const k1 = K1_BY_METHOD[installMethod];
  if (k1 === undefined) {
    throw new UnsupportedInstallMethodError(installMethod);
  }

  // `?? 1.0` here is unreachable dead code, not a live fail-open fallback: k2Index is clamped
  // into [0, k2Table.length - 1] and both K2 tables (constants.ts) are fixed non-empty literal
  // arrays, so the index always resolves. Kept only because noUncheckedIndexedAccess types the
  // index access as possibly undefined; verified by trace, not left as a silent unsafe default.
  const k2Table =
    referenceMethod === 'E' || referenceMethod === 'F'
      ? K2_TRAY_PERFORATED_E_F
      : K2_ENCLOSED_B_C;
  const k2Index = Math.min(groupedCircuits - 1, k2Table.length - 1);
  const k2 = k2Table[Math.max(0, k2Index)] ?? 1.0;

  // `?? 1.0` here is likewise unreachable: nearestTempKey always returns a key that exists in
  // its own input table (either the nearest key <= ambientTempC, or the lowest key when
  // ambientTempC is below every tabled value — verified by trace, see nearestTempKey's own
  // doc comment), so the lookup below never actually misses.
  const k3Table = insulation === 'PVC' ? K3_PVC : K3_PR;
  const k3 = k3Table[nearestTempKey(k3Table, ambientTempC)] ?? 1.0;

  const k4 = k4ForLayers(layers);

  return { k1, k2, k3, k4 };
}

/** x-rules.derived IZ_CORRECTED: Iz * K1 * K2 * K3 * K4 (factors: izCorrectionFactors). */
export function izCorrected(
  izBase: number,
  installMethod: string,
  referenceMethod: ReferenceMethod,
  groupedCircuits: number,
  layers: number,
  ambientTempC: number,
  insulation: InsulationType,
): number {
  const { k1, k2, k3, k4 } = izCorrectionFactors(installMethod, referenceMethod, groupedCircuits, layers, ambientTempC, insulation);
  // Same left-to-right product as before the factors were split out, so results stay bit-identical.
  return izBase * k1 * k2 * k3 * k4;
}

/** x-rules.derived DU_DC_V: 2 * rho * L / S * M.impA * Np_on_run */
export function duDcV(
  conductor: ConductorType,
  lengthM: number,
  sectionMm2: number,
  impA: number,
  npOnRun: number,
): number {
  const rho = resistivityFor(conductor);
  return ((2 * rho * lengthM) / sectionMm2) * impA * npOnRun;
}

/** x-rules.derived DU_DC_PCT: 100 * DU_DC_V / STRING_VMP_STC */
export function duDcPct(duDcVoltageDrop: number, stringVmpStc: number): number {
  return (100 * duDcVoltageDrop) / stringVmpStc;
}

/**
 * x-rules.derived DU_AC_V: b * (rho * L / S * cosPhi + lambda * L * sinPhi) * INV.iacMaxA.
 * b = 2 single-phase, √3 three-phase (NF C 15-100 / UTE C 15-105).
 */
export function duAcV(
  conductor: ConductorType,
  lengthM: number,
  sectionMm2: number,
  cosPhi: number,
  lambdaOhmPerM: number,
  iacMaxA: number,
  phases: 1 | 3,
): number {
  const rho = resistivityFor(conductor);
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  const b = phases === 1 ? 2 : Math.sqrt(3);
  const resistiveTerm = ((rho * lengthM) / sectionMm2) * cosPhi;
  const reactiveTerm = lambdaOhmPerM * lengthM * sinPhi;
  return b * (resistiveTerm + reactiveTerm) * iacMaxA;
}

/**
 * x-rules.derived DU_AC_PCT: 100 * DU_AC_V / V.
 * V = 230 single-phase (phase-neutral), 400 three-phase (line-to-line) — schema note on DU_AC_PCT.
 * The phases argument here MUST be the same value passed to duAcV, so the b factor and the
 * reference voltage always switch together.
 */
export function duAcPct(duAcVoltageDrop: number, phases: 1 | 3): number {
  const referenceVoltage = phases === 1 ? 230 : 400;
  return (100 * duAcVoltageDrop) / referenceVoltage;
}
