import type { PvModuleInput } from './types';

/**
 * Resolves the temperature coefficient used for Vmp correction.
 * Schema note on VMP_TMIN/VMP_TMAX (x-rules.derived): coeffVmp = tempCoeffVmpPct ?? tempCoeffPmaxPct.
 * MUST NOT fall back to tempCoeffVocPct — using the Voc coefficient for Vmp correction was
 * the exact error identified in the reference dossier (spec §4).
 */
export function resolveVmpTempCoeff(module: PvModuleInput): number {
  return module.tempCoeffVmpPct ?? module.tempCoeffPmaxPct;
}

/** x-rules.derived VOC_TMIN: vocV * (1 + tempCoeffVocPct/100 * (tMinC - 25)) */
export function vocAtTmin(module: PvModuleInput, tMinC: number): number {
  return module.vocV * (1 + (module.tempCoeffVocPct / 100) * (tMinC - 25));
}

/** x-rules.derived VMP_TMIN: vmpV * (1 + coeffVmp/100 * (tMinC - 25)) */
export function vmpAtTmin(module: PvModuleInput, tMinC: number): number {
  const coeffVmp = resolveVmpTempCoeff(module);
  return module.vmpV * (1 + (coeffVmp / 100) * (tMinC - 25));
}

/** x-rules.derived VMP_TMAX: vmpV * (1 + coeffVmp/100 * (tMaxC - 25)) */
export function vmpAtTmax(module: PvModuleInput, tMaxC: number): number {
  const coeffVmp = resolveVmpTempCoeff(module);
  return module.vmpV * (1 + (coeffVmp / 100) * (tMaxC - 25));
}

/**
 * x-rules.derived ISC_TMAX: iscA * (1 + tempCoeffIscPct/100 * (tMaxC - 25)) * (1 + bifacialGainPct/100)
 */
export function iscAtTmax(module: PvModuleInput, tMaxC: number): number {
  const base = module.iscA * (1 + (module.tempCoeffIscPct / 100) * (tMaxC - 25));
  const bifacialGain = module.bifacialGainPct ?? 0;
  return base * (1 + bifacialGain / 100);
}

/**
 * x-rules.derived IMP_TMAX: impA * (1 + tempCoeffIscPct/100 * (tMaxC - 25)) * (1 + bifacialGainPct/100)
 * Note: the schema explicitly reuses the Isc coefficient (not a separate Imp coefficient) here.
 */
export function impAtTmax(module: PvModuleInput, tMaxC: number): number {
  const base = module.impA * (1 + (module.tempCoeffIscPct / 100) * (tMaxC - 25));
  const bifacialGain = module.bifacialGainPct ?? 0;
  return base * (1 + bifacialGain / 100);
}
