import type { EngineResult, RunEngineInput } from '@dossipv/engine';
import type { CalculationNote } from '@dossipv/docx-template';
import { ANNEX_NUMBERS } from './annex-plan';

const frNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const fr = (value: number): string => frNumber.format(value);

export interface StructureRowsInput {
  engineInput: RunEngineInput;
  engineResult: EngineResult;
  material: string;
  /** PVGIS aspect convention: 0 = south; null when the site has no azimuth. */
  azimuthDeg: number | null;
  /** True when the project holds the structure conformity attestation (annex N°3). */
  hasAttestation: boolean;
}

/** The rows of the structure section's table, all pre-formatted French text. */
export function buildStructureRows({ engineInput, engineResult, material, azimuthDeg, hasAttestation }: StructureRowsInput): { label: string; value: string }[] {
  const { structure, module } = engineInput;
  const moduleCount = engineResult.derived.MODULE_COUNT ?? 0;
  const hasBallast = structure.ballastPerFrame > 0 && structure.ballastMassKg > 0;
  return [
    { label: 'Matériau', value: material },
    { label: 'Nombre de modules', value: fr(moduleCount) },
    { label: 'Masse des modules', value: `${fr(moduleCount)} × ${fr(module.weightKg)} kg` },
    { label: 'Inclinaison', value: `${fr(structure.tiltDeg)} °` },
    { label: 'Orientation', value: azimuthDeg === null ? 'à définir' : `azimut ${fr(azimuthDeg)}° (0° = plein sud)` },
    { label: 'Vitesse de vent de calcul', value: `${fr(structure.windSpeedKmh)} km/h` },
    {
      label: 'Lestage',
      value: hasBallast ? `${fr(structure.ballastPerFrame)} × ${fr(structure.ballastMassKg)} kg par cadre` : "à définir sur site selon l'étude de stabilité",
    },
    { label: 'Attestation de conformité', value: hasAttestation ? `annexe N°${ANNEX_NUMBERS.STRUCTURE}` : 'à fournir' },
  ];
}

const STABILITY_LEGEND =
  'P : poids total (N) ; Cp : coefficient de portance (N/m²) ; Ct : coefficient de traînée (N/m²) ; S : surface des modules (m²) ; D : profondeur (m) ; H : hauteur (m)';

/**
 * The wind stability note (check C18), one note when the project supplied the stability inputs and
 * none otherwise. Cp and Ct are recovered from the engine's own LHS/RHS so the note can never
 * disagree with the check.
 */
export function buildStabilityNotes({ engineInput, engineResult }: Pick<StructureRowsInput, 'engineInput' | 'engineResult'>): CalculationNote[] {
  const { derived } = engineResult;
  const weight = derived.F_WEIGHT_N;
  const lhs = derived.STABILITY_LHS;
  const rhs = derived.STABILITY_RHS;
  const area = derived.MODULE_AREA_M2;
  const { depthDM, heightHM } = engineInput.structure;
  if (weight === undefined || lhs === undefined || rhs === undefined || area === undefined || !depthDM || !heightHM || area === 0) return [];
  const lift = (weight - lhs / depthDM) / area;
  const drag = rhs / (2 * area * heightHM);
  return [
    {
      title: 'Stabilité au vent',
      formula: `(P − Cp × S) × D > 2 × Ct × S × H\n${STABILITY_LEGEND}`,
      application: `(${fr(weight)} − ${fr(lift)} × ${fr(area)}) × ${fr(depthDM)} > 2 × ${fr(drag)} × ${fr(area)} × ${fr(heightHM)}`,
      result: `${fr(lhs)} ${lhs > rhs ? '>' : '≤'} ${fr(rhs)}`,
      conclusion: lhs > rhs ? 'condition vérifiée' : 'condition non vérifiée',
    },
  ];
}
