import type { EquipmentKind } from '@dossipv/db';
import type { RcdType } from '@dossipv/engine';
import { FormReader } from './form-reader';

export interface CableSectionInput {
  sectionMm2: number;
  izA: number;
  izReferenceMethod: string;
}

/** The equipment columns read from a form, ready for a Prisma create/update (files and owner excluded). */
export type EquipmentFormData = Record<string, string | number | boolean | Date | null>;

export type EquipmentFormResult =
  | { ok: true; data: EquipmentFormData; sections: CableSectionInput[] | null }
  | { ok: false; error: string };

const ACCESSORY_KINDS = ['MC4_CONNECTOR', 'DISTRIBUTION_BLOCK', 'CABLE_TRAY', 'DC_ENCLOSURE', 'AC_ENCLOSURE', 'EARTH_ROD', 'OTHER'] as const;
const CABLE_USAGES = ['DC_SOLAR', 'AC', 'EARTH'] as const;
const SPD_SIDES = ['DC', 'AC'] as const;
const RCD_TYPES = ['AC', 'A', 'F', 'B'] as const satisfies readonly RcdType[];

/** Required number strictly above zero. */
function positive(r: FormReader, name: string, label: string): number {
  const before = r.errors.length;
  const value = r.number(name, label);
  if (r.errors.length === before && value <= 0) r.errors.push(`${label} : doit être > 0.`);
  return value;
}

function identity(r: FormReader): EquipmentFormData {
  return { brand: r.text('brand', 'Marque', 100), model: r.text('model', 'Modèle', 150) };
}

/** Optional `YYYY-MM-DD` date — empty becomes null. */
function optionalDate(r: FormReader, formData: FormData, name: string, label: string): Date | null {
  const raw = formData.get(name);
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
  if (!date || Number.isNaN(date.getTime())) {
    r.errors.push(`${label} : date invalide.`);
    return null;
  }
  return date;
}

function homologation(r: FormReader, formData: FormData): EquipmentFormData {
  return {
    homologationReference: r.optionalText('homologationReference', "Référence d'homologation", 100),
    homologationValidTo: optionalDate(r, formData, 'homologationValidTo', "Fin de validité de l'homologation"),
  };
}

function pvModule(r: FormReader): EquipmentFormData {
  const data = {
    ...identity(r),
    pmaxW: positive(r, 'pmaxW', 'Puissance Pmax'),
    vmpV: positive(r, 'vmpV', 'Tension Vmp'),
    impA: positive(r, 'impA', 'Courant Imp'),
    vocV: positive(r, 'vocV', 'Tension Voc'),
    iscA: positive(r, 'iscA', 'Courant Isc'),
    tempCoeffVocPct: r.number('tempCoeffVocPct', 'Coeff. temp. Voc', { min: -2, max: 2 }),
    tempCoeffIscPct: r.number('tempCoeffIscPct', 'Coeff. temp. Isc', { min: -2, max: 2 }),
    tempCoeffPmaxPct: r.number('tempCoeffPmaxPct', 'Coeff. temp. Pmax', { min: -2, max: 2 }),
    tempCoeffVmpPct: r.optionalNumber('tempCoeffVmpPct', 'Coeff. temp. Vmp', { min: -2, max: 2 }),
    irmA: positive(r, 'irmA', 'Courant inverse max Irm'),
    maxSystemVoltageV: positive(r, 'maxSystemVoltageV', 'Tension système max'),
    bifacial: r.boolean('bifacial'),
    bifacialGainPct: r.optionalNumber('bifacialGainPct', 'Gain bifacial', { min: 0, max: 100 }),
    lengthMm: positive(r, 'lengthMm', 'Longueur'),
    widthMm: positive(r, 'widthMm', 'Largeur'),
    weightKg: positive(r, 'weightKg', 'Poids'),
    noctC: r.optionalNumber('noctC', 'NOCT', { min: 0, max: 100 }),
  };
  if (!r.hasErrors) {
    if (data.vmpV >= data.vocV) r.errors.push('La tension Vmp doit être inférieure à la tension Voc.');
    if (data.impA >= data.iscA) r.errors.push('Le courant Imp doit être inférieur au courant Isc.');
  }
  return data;
}

function inverter(r: FormReader): EquipmentFormData {
  const data = {
    ...identity(r),
    phases: r.integer('phases', 'Phases'),
    pacW: positive(r, 'pacW', 'Puissance AC nominale'),
    sacVA: positive(r, 'sacVA', 'Puissance apparente max'),
    vdcMaxV: positive(r, 'vdcMaxV', 'Tension DC max'),
    mpptMinV: positive(r, 'mpptMinV', 'Tension MPPT min'),
    mpptMaxV: positive(r, 'mpptMaxV', 'Tension MPPT max'),
    startUpV: positive(r, 'startUpV', 'Tension de démarrage'),
    mpptCount: r.integer('mpptCount', 'Nombre de MPPT', { min: 1, max: 20 }),
    inputsPerMppt: r.integer('inputsPerMppt', 'Entrées par MPPT', { min: 1, max: 10 }),
    idcMaxPerMpptA: positive(r, 'idcMaxPerMpptA', 'Courant DC max par MPPT'),
    iscMaxPerMpptA: positive(r, 'iscMaxPerMpptA', 'Courant de court-circuit max par MPPT'),
    vacNomV: positive(r, 'vacNomV', 'Tension AC nominale'),
    vacRangeV: r.optionalText('vacRangeV', 'Plage de tension AC', 50),
    iacMaxA: positive(r, 'iacMaxA', 'Courant AC max'),
    integratedDcSwitch: r.boolean('integratedDcSwitch'),
    stegApproved: r.boolean('stegApproved'),
  };
  if (!r.hasErrors) {
    if (data.phases !== 1 && data.phases !== 3) r.errors.push('Phases : 1 (monophasé) ou 3 (triphasé).');
    if (data.mpptMinV >= data.mpptMaxV) r.errors.push('La tension MPPT min doit être inférieure à la tension MPPT max.');
    if (data.mpptMaxV > data.vdcMaxV) r.errors.push('La tension MPPT max ne peut pas dépasser la tension DC max.');
    if (data.pacW > data.sacVA) r.errors.push('La puissance AC nominale ne peut pas dépasser la puissance apparente max.');
  }
  return data;
}

function spd(r: FormReader, formData: FormData): EquipmentFormData {
  return {
    ...identity(r),
    side: r.oneOf('side', 'Côté', SPD_SIDES),
    type: r.integer('type', 'Type', { min: 1, max: 3 }),
    poles: r.integer('poles', 'Nombre de pôles', { min: 1, max: 8 }),
    ucV: positive(r, 'ucV', 'Tension de service Uc'),
    upKV: positive(r, 'upKV', 'Niveau de protection Up'),
    inKA: positive(r, 'inKA', 'Courant nominal In'),
    imaxKA: positive(r, 'imaxKA', 'Courant max Imax'),
    iscpvKA: r.optionalNumber('iscpvKA', 'Courant de court-circuit PV Iscpv', { min: 0 }),
    ...homologation(r, formData),
  };
}

function dcSwitch(r: FormReader, formData: FormData): EquipmentFormData {
  return {
    ...identity(r),
    ratedVoltageV: positive(r, 'ratedVoltageV', 'Tension nominale'),
    ratedCurrentA: positive(r, 'ratedCurrentA', 'Courant nominal'),
    poles: r.integer('poles', 'Nombre de pôles', { min: 1, max: 8 }),
    ...homologation(r, formData),
  };
}

function dcFuse(r: FormReader, formData: FormData): EquipmentFormData {
  return {
    ...identity(r),
    ratedVoltageV: positive(r, 'ratedVoltageV', 'Tension nominale'),
    ratedCurrentA: positive(r, 'ratedCurrentA', 'Courant nominal'),
    ...homologation(r, formData),
  };
}

function acBreaker(r: FormReader, formData: FormData): EquipmentFormData {
  const data = {
    ...identity(r),
    ratedCurrentA: positive(r, 'ratedCurrentA', 'Courant nominal'),
    curve: r.optionalText('curve', 'Courbe', 10),
    breakingCapacityKA: r.optionalNumber('breakingCapacityKA', 'Pouvoir de coupure', { min: 0 }),
    residualCurrentMA: r.optionalInteger('residualCurrentMA', 'Sensibilité différentielle', { min: 1, max: 10_000 }),
    rcdType: r.optionalOneOf('rcdType', 'Type de différentiel', RCD_TYPES),
    ...homologation(r, formData),
  };
  if (!r.hasErrors && (data.residualCurrentMA === null) !== (data.rcdType === null)) {
    r.errors.push('Renseignez à la fois la sensibilité (mA) et le type du différentiel, ou aucun des deux.');
  }
  return data;
}

function acIsolator(r: FormReader, formData: FormData): EquipmentFormData {
  return { ...identity(r), ratedCurrentA: positive(r, 'ratedCurrentA', 'Courant nominal'), ...homologation(r, formData) };
}

function cable(r: FormReader, formData: FormData): EquipmentFormData {
  return {
    ...identity(r),
    usage: r.oneOf('usage', 'Usage', CABLE_USAGES),
    conductor: r.text('conductor', 'Conducteur', 50),
    insulation: r.text('insulation', 'Isolation', 50),
    standard: r.optionalText('standard', 'Norme', 100),
    ...homologation(r, formData),
  };
}

/** The `sections` hidden field of the cable form: a JSON array of { sectionMm2, izA, izReferenceMethod }. */
function cableSections(r: FormReader, formData: FormData): CableSectionInput[] {
  const raw = formData.get('sections');
  let parsed: unknown = null;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.length <= 30 &&
    parsed.every((entry: unknown) => {
      const e = entry as Partial<CableSectionInput> | null;
      return (
        typeof e === 'object' &&
        e !== null &&
        typeof e.sectionMm2 === 'number' &&
        Number.isFinite(e.sectionMm2) &&
        e.sectionMm2 > 0 &&
        typeof e.izA === 'number' &&
        Number.isFinite(e.izA) &&
        e.izA > 0 &&
        typeof e.izReferenceMethod === 'string' &&
        e.izReferenceMethod.trim().length > 0 &&
        e.izReferenceMethod.length <= 20
      );
    });
  if (!valid) {
    r.errors.push('Au moins une section de câble est requise (section, Iz et mode de pose, valeurs positives).');
    return [];
  }
  return (parsed as CableSectionInput[]).map((e) => ({ sectionMm2: e.sectionMm2, izA: e.izA, izReferenceMethod: e.izReferenceMethod.trim() }));
}

function accessory(r: FormReader, formData: FormData): EquipmentFormData {
  return {
    ...identity(r),
    kind: r.oneOf('kind', 'Type', ACCESSORY_KINDS),
    spec: r.optionalText('spec', 'Spécification', 200),
    ...homologation(r, formData),
  };
}

const READERS: Record<EquipmentKind, (r: FormReader, formData: FormData) => EquipmentFormData> = {
  PV_MODULE: pvModule,
  INVERTER: inverter,
  SPD: spd,
  DC_SWITCH: dcSwitch,
  DC_FUSE: dcFuse,
  AC_BREAKER: acBreaker,
  AC_ISOLATOR: acIsolator,
  CABLE: cable,
  ACCESSORY: accessory,
};

/**
 * Reads and validates an installer's own equipment form (the shared field components under
 * `components/equipment/`). Every error is collected so the installer sees them all at once.
 */
export function readEquipmentForm(kind: EquipmentKind, formData: FormData): EquipmentFormResult {
  const r = new FormReader(formData);
  const data = READERS[kind](r, formData);
  const sections = kind === 'CABLE' ? cableSections(r, formData) : null;
  return r.hasErrors ? { ok: false, error: r.errorMessage() } : { ok: true, data, sections };
}
