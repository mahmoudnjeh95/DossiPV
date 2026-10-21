import type { StegInverterListing } from './types';

export interface PvModuleRecord {
  model: string;
  pmaxW: number | null; vmpV: number | null; impA: number | null; vocV: number | null; iscA: number | null;
  tempCoeffVocPct: number | null; tempCoeffIscPct: number | null; tempCoeffPmaxPct: number | null; tempCoeffVmpPct: number | null;
  irmA: number | null; maxSystemVoltageV: number | null;
  bifacial: boolean; bifacialGainPct: number | null;
  lengthMm: number | null; widthMm: number | null; weightKg: number | null; noctC: number | null;
  sourcePages: number[];
}

export interface InverterRecord {
  model: string;
  phases: number | null; pacW: number | null; sacVA: number | null; vdcMaxV: number | null;
  mpptMinV: number | null; mpptMaxV: number | null; startUpV: number | null;
  mpptCount: number | null; inputsPerMppt: number | null; idcMaxPerMpptA: number | null; iscMaxPerMpptA: number | null;
  vacNomV: number | null; vacRangeV: string | null; iacMaxA: number | null; integratedDcSwitch: boolean | null;
  sourcePages: number[];
}

export interface ValidationResult { errors: string[]; warnings: string[] }

const MODULE_REQUIRED = ['pmaxW', 'vmpV', 'impA', 'vocV', 'iscA', 'tempCoeffVocPct', 'tempCoeffIscPct', 'tempCoeffPmaxPct', 'irmA', 'maxSystemVoltageV', 'lengthMm', 'widthMm', 'weightKg'] as const;
const INVERTER_REQUIRED = ['phases', 'pacW', 'sacVA', 'vdcMaxV', 'mpptMinV', 'mpptMaxV', 'startUpV', 'mpptCount', 'inputsPerMppt', 'idcMaxPerMpptA', 'iscMaxPerMpptA', 'vacNomV', 'iacMaxA'] as const;

function outOfRange(value: number, min: number, max: number): boolean {
  return value < min || value > max;
}

export function validatePvModule(r: PvModuleRecord): ValidationResult {
  const errors = MODULE_REQUIRED.filter((key) => r[key] === null).map((key) => `${key} manquant sur la fiche.`);
  const warnings: string[] = [];
  if (r.vmpV !== null && r.vocV !== null && r.vmpV >= r.vocV) errors.push(`Vmp (${r.vmpV}) doit être inférieur à Voc (${r.vocV}).`);
  if (r.impA !== null && r.iscA !== null && r.impA >= r.iscA) errors.push(`Imp (${r.impA}) doit être inférieur à Isc (${r.iscA}).`);
  if (r.pmaxW !== null && r.vmpV !== null && r.impA !== null) {
    const product = r.vmpV * r.impA;
    if (Math.abs(r.pmaxW - product) / r.pmaxW > 0.03) errors.push(`Pmax (${r.pmaxW}) ≠ Vmp × Imp (${product.toFixed(1)}) à plus de 3 %.`);
  }
  if (r.tempCoeffVocPct !== null && outOfRange(r.tempCoeffVocPct, -0.35, -0.2)) errors.push(`Coefficient Voc (${r.tempCoeffVocPct} %/°C) hors de la plage -0.35…-0.2.`);
  if (r.tempCoeffIscPct !== null && outOfRange(r.tempCoeffIscPct, 0, 0.1)) errors.push(`Coefficient Isc (${r.tempCoeffIscPct} %/°C) hors de la plage 0…0.1.`);
  if (r.tempCoeffPmaxPct !== null && outOfRange(r.tempCoeffPmaxPct, -0.45, -0.25)) errors.push(`Coefficient Pmax (${r.tempCoeffPmaxPct} %/°C) hors de la plage -0.45…-0.25.`);
  if (r.maxSystemVoltageV !== null && r.maxSystemVoltageV !== 1000 && r.maxSystemVoltageV !== 1500) warnings.push(`Tension système max inhabituelle (${r.maxSystemVoltageV} V).`);
  if (r.lengthMm !== null && outOfRange(r.lengthMm, 1000, 2600)) errors.push(`Longueur (${r.lengthMm} mm) improbable.`);
  if (r.widthMm !== null && outOfRange(r.widthMm, 900, 1400)) errors.push(`Largeur (${r.widthMm} mm) improbable.`);
  if (r.weightKg !== null && outOfRange(r.weightKg, 10, 45)) errors.push(`Poids (${r.weightKg} kg) improbable.`);
  return { errors, warnings };
}

export function validateInverter(r: InverterRecord, listing: StegInverterListing | undefined): ValidationResult {
  const errors = INVERTER_REQUIRED.filter((key) => r[key] === null).map((key) => `${key} manquant sur la fiche.`);
  const warnings: string[] = [];
  if (r.phases !== null && r.phases !== 1 && r.phases !== 3) errors.push(`Nombre de phases (${r.phases}) invalide.`);
  if (r.mpptMinV !== null && r.mpptMaxV !== null && r.mpptMinV >= r.mpptMaxV) errors.push(`Plage MPPT incohérente (${r.mpptMinV}–${r.mpptMaxV} V).`);
  if (r.mpptMaxV !== null && r.vdcMaxV !== null && r.mpptMaxV > r.vdcMaxV) errors.push(`Plage MPPT max (${r.mpptMaxV} V) au-dessus de la tension DC max (${r.vdcMaxV} V).`);
  if (r.pacW !== null && r.sacVA !== null && r.pacW > r.sacVA) errors.push(`Puissance active (${r.pacW} W) supérieure à l'apparente (${r.sacVA} VA).`);
  if (listing && r.pacW !== null && Math.abs(r.pacW - listing.acPowerW) / listing.acPowerW > 0.01) {
    errors.push(`Puissance AC (${r.pacW} W) différente de la liste STEG (${listing.acPowerW} W).`);
  }
  if (r.pacW !== null && r.vacNomV !== null && r.iacMaxA !== null && r.phases !== null) {
    const nominal = r.pacW / (r.vacNomV * (r.phases === 3 ? Math.sqrt(3) : 1));
    if (r.iacMaxA < nominal * 0.95) warnings.push(`Courant AC max (${r.iacMaxA} A) inférieur au courant nominal calculé (${nominal.toFixed(1)} A).`);
  }
  return { errors, warnings };
}
