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

function resistivityFor(conductor: ConductorType): number {
  return conductor === 'Cu' ? RHO_CU : RHO_AL;
}

/** Nearest table key at or below the given ambient temperature, matching the K3 tables' step gaps. */
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
 * x-rules.derived IZ_CORRECTED: Iz * K1 * K2 * K3 * K4.
 * K1 from install method (K1_BY_METHOD). K2 from grouped circuits, using the tray table for
 * reference methods E/F (perforated) and the enclosed table for B/C.
 * K3 from ambient temperature and insulation — schema note: PR/EPR/XLPO all use the PR column.
 * K4 from layer count.
 */
export function izCorrected(
  izBase: number,
  installMethod: string,
  referenceMethod: ReferenceMethod,
  groupedCircuits: number,
  layers: number,
  ambientTempC: number,
  insulation: InsulationType,
): number {
  const k1 = K1_BY_METHOD[installMethod] ?? 1.0;

  const k2Table =
    referenceMethod === 'E' || referenceMethod === 'F'
      ? K2_TRAY_PERFORATED_E_F
      : K2_ENCLOSED_B_C;
  const k2Index = Math.min(groupedCircuits - 1, k2Table.length - 1);
  const k2 = k2Table[Math.max(0, k2Index)] ?? 1.0;

  const k3Table = insulation === 'PVC' ? K3_PVC : K3_PR;
  const k3 = k3Table[nearestTempKey(k3Table, ambientTempC)] ?? 1.0;

  const k4 = K4_LAYERS[String(layers)] ?? 1.0;

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
 * b = 2 for single-phase, 1 for three-phase (schema note on DU_AC_V).
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
  const b = phases === 1 ? 2 : 1;
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
