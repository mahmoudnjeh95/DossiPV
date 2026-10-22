/**
 * French labels for every enumerated value the installer-facing forms expose. Values are the
 * exact strings from pv_dossier_input_schema.json (and the Prisma enums where one exists), so
 * what the form stores is what the engine/worker expect — labels are display-only.
 */
export interface Option<T extends string | number = string> {
  value: T;
  label: string;
}

export const CIVILITY_OPTIONS: Option[] = [
  { value: 'M.', label: 'M.' },
  { value: 'Mme', label: 'Mme' },
  { value: 'Société', label: 'Société' },
];

export const CLIENT_KIND_OPTIONS: Option[] = [
  { value: 'residential', label: 'Résidentiel' },
  { value: 'professional', label: 'Professionnel' },
];

export const GRID_TYPE_OPTIONS: Option[] = [
  { value: 'BT', label: 'Basse tension (BT)' },
  { value: 'MT', label: 'Moyenne tension (MT)' },
  { value: 'ISOLATED', label: 'Site isolé (hors réseau)' },
];

export const PHASES_OPTIONS: Option<number>[] = [
  { value: 1, label: 'Monophasé' },
  { value: 3, label: 'Triphasé' },
];

export const MOUNTING_TYPE_OPTIONS: Option[] = [
  { value: 'FLAT_ROOF_BALLAST', label: 'Toiture terrasse – lestage' },
  { value: 'FLAT_ROOF_ANCHORED', label: 'Toiture terrasse – ancrage' },
  { value: 'SLOPED_ROOF', label: 'Toiture inclinée' },
  { value: 'GROUND', label: 'Au sol' },
  { value: 'CARPORT', label: 'Ombrière / carport' },
];

export const SHADING_OPTIONS: Option[] = [
  { value: 'NONE', label: 'Aucun' },
  { value: 'PARTIAL', label: 'Partiel' },
  { value: 'SIGNIFICANT', label: 'Important' },
];

export const EQUIPMENT_LOCATION_OPTIONS: Option[] = [
  { value: 'TECHNICAL_ROOM', label: 'Local technique' },
  { value: 'OUTDOOR_SHADED', label: 'Extérieur à l’ombre' },
  { value: 'OUTDOOR_SUN', label: 'Extérieur au soleil' },
];

/** A single-phase site is "Monophasé"; on a three-phase site the PV inverter goes on one phase. */
export const PHASE_CONNECTION_OPTIONS: Option[] = [
  { value: 'MONO', label: 'Monophasé' },
  { value: 'L1', label: 'L1' },
  { value: 'L2', label: 'L2' },
  { value: 'L3', label: 'L3' },
];

export const CABLE_SECTION_OPTIONS: number[] = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

export const INSTALL_METHOD_OPTIONS: Option[] = [
  '1', '2', '3', '3A', '4', '4A', '5', '5A', '11', '11A', '12', '13', '14', '16', '17', '18', '21', '22', '61', '62', '63',
].map((value) => ({ value, label: `Mode ${value}` }));

/** Install methods the engine has a K1 factor for (constants.K1_BY_METHOD). Others block generation. */
export const INSTALL_METHODS_WITH_K1 = new Set(['1', '2', '3', '3A', '4', '4A', '5', '5A', '11', '11A', '12', '13', '14', '16', '17', '18']);

export const AMBIENT_CONTEXT_OPTIONS: Option[] = [
  { value: 'BURIED', label: 'Enterré (25 °C)' },
  { value: 'TECHNICAL_ROOM', label: 'Local technique (50 °C)' },
  { value: 'TRAY_SHADED', label: 'Chemin de câbles à l’ombre (50 °C)' },
  { value: 'TRAY_SUN', label: 'Chemin de câbles au soleil (80 °C)' },
];

/** pv_dossier_input_schema.json CableRun.ambientContext x-lookup — ambient °C per context. */
export const AMBIENT_TEMP_BY_CONTEXT: Record<string, number> = {
  BURIED: 25,
  TECHNICAL_ROOM: 50,
  TRAY_SHADED: 50,
  TRAY_SUN: 80,
};

export const STRUCTURE_MATERIAL_OPTIONS: Option[] = [
  { value: 'ALUMINIUM', label: 'Aluminium' },
  { value: 'GALVANIZED_STEEL', label: 'Acier galvanisé' },
];

/**
 * `PVGIS_LIVE` is the value the dossier-worker's mandatory PVGIS step (processJob) writes
 * (sub-project #7); pv_dossier_input_schema.json still names this source `PVGIS_AUTO` — the worker is the
 * writer, so the form follows the worker.
 */
export const SIMULATION_SOURCE_OPTIONS: Option[] = [
  { value: 'PVGIS_LIVE', label: 'Simulation automatique (PVGIS)' },
  { value: 'PVSYST_UPLOAD', label: 'Rapport PVsyst fourni' },
];

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  GENERATED: 'Généré',
  SUBMITTED: 'Déposé',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  RUNNING: 'En cours',
  SUCCEEDED: 'Terminé',
  FAILED: 'Échec',
};

export const TIER_LABELS: Record<string, string> = {
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
};

export function labelFor(options: Option<string | number>[], value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return options.find((option) => option.value === value)?.label ?? String(value);
}

const ratingFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** `16 A · 30 mA type A` for a differential breaker, `16 A` for a plain one. */
export function acBreakerRating(breaker: { ratedCurrentA: number; residualCurrentMA: number | null; rcdType: string | null }): string {
  const rating = `${ratingFormat.format(breaker.ratedCurrentA)} A`;
  return breaker.residualCurrentMA !== null && breaker.rcdType !== null
    ? `${rating} · ${ratingFormat.format(breaker.residualCurrentMA)} mA type ${breaker.rcdType}`
    : rating;
}

export const RCD_TYPE_OPTIONS: Option[] = [
  { value: 'A', label: 'Type A' },
  { value: 'F', label: 'Type F' },
  { value: 'B', label: 'Type B' },
  { value: 'AC', label: 'Type AC (insuffisant pour le PV)' },
];

/** No dossier without the company's uploaded ANME agreement (product owner, 2026-10-22). */
export const ANME_AGREEMENT_REQUIRED_MESSAGE = "Ajoutez l'attestation d'agrément ANME de votre société dans Paramètres avant de générer.";
