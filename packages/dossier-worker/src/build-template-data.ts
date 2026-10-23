import type { RunEngineInput } from '@dossipv/engine';
import { PLACEHOLDER_DEFINITIONS, type ProjectMeta } from './placeholder-map';
import type { DossierWorkerResult } from './generate-dossier-document';
import type { DossierTemplateData } from '@dossipv/docx-template';
import type { ProductionSimulation } from './run-simulation';
import type { SnapshotConsumption } from './job-snapshot';
import { anmeCategoryLabel, type InstallerIdentity } from './installer-identity';
import { buildProtectionNotes, buildStringSizingNotes, buildTemperatureAssumptions } from './calculation-notes';
import { CHECK_LABELS } from '@dossipv/engine';
import type { EquipmentTables } from './equipment-tables';
import { buildStabilityNotes, buildStructureRows } from './structure-notes';
import { buildCableSizingRows, buildVoltageDropLimitsText, buildVoltageDropRows, installMethodText } from './cable-notes';

export interface EarthingRow {
  rodCount: number;
  rodLengthM: number;
  mainEarthSectionMm2: number;
  frameEarthSectionMm2: number;
  earthToPitSectionMm2: number;
  targetResistanceOhm: number;
}

export interface BuildTemplateDataInput {
  workerResult: DossierWorkerResult;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  snapshot: {
    client: { fullName: string; address: string | null; stegReference: string | null; cin: string | null } | null;
    /** circuitType ('DC' | 'AC') names the engine's dcRun/acRun links; absent from older test snapshots. */
    cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string; circuitType?: string }[];
    /** The project's earthing row; null when the project has none. */
    earthing: EarthingRow | null;
    // Each inverter's own brand/model, by snapshot array index — projectMeta.inverterBrandModel
    // is only the FIRST inverter's model (see I7: a mixed-model array must not show the wrong
    // model on every other inverter's row).
    inverterBrandModels: string[];
    /** The AC surge arrester's nominal discharge current In (kA), from the catalog row; null when unknown. */
    acSpdInKA?: number | null;
    /** The site's PVGIS-convention azimuth (0 = south); null/absent when unknown. */
    azimuthDeg?: number | null;
    /** True when the project holds the structure conformity attestation (annex N°3). */
    hasStructureAttestation?: boolean;
  };
  installer: InstallerIdentity;
  /** The documentation, equipment, characteristics and rating tables; empty tables when absent (legacy callers). */
  equipmentTables?: EquipmentTables;
  /** The installer's own dossier number (e.g. `434 - 303`); empty only for a legacy snapshot. */
  dossierNumber: string | null;
  /** ISO date or timestamp of the dossier. */
  dossierDate: string;
  production: ProductionSimulation;
  consumption: SnapshotConsumption | null;
  subscribedPowerKVA: number | null;
  phases: 1 | 3;
  /** STEG pieces missing when the job was queued; the dossier is then a draft. Absent = none. */
  draftMissing?: string[];
}

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const;
const MAX_DC_AC_RATIO = 1.3;

/** Number with at most `maxDecimals` decimals, decimal comma (fr-FR). */
function fmtUpTo(value: number, maxDecimals: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxDecimals }).format(value);
}

/** `2026-01-31` to `31/01/2026`. */
function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** The preamble's installer and client identity lines. */
function buildIdentityLines(input: BuildTemplateDataInput): Pick<
  DossierTemplateData,
  'dossierNumber' | 'dossierDateText' | 'installerAnmeLine' | 'installerTaxIdLine' | 'installerLegalRepLine' | 'clientCinLine'
> {
  const { installer, snapshot } = input;
  const cin = snapshot.client?.cin?.trim();
  return {
    dossierNumber: input.dossierNumber ?? '',
    dossierDateText: formatIsoDate(input.dossierDate),
    installerAnmeLine: `Installateur agréé ANME n° ${installer.anmeCode} (catégorie ${anmeCategoryLabel(installer.anmeCategory)}), agrément valable jusqu'au ${formatIsoDate(installer.anmeValidTo)}`,
    installerTaxIdLine: `Matricule fiscal : ${installer.taxId ?? 'non renseigné'}`,
    installerLegalRepLine: `Représentant légal : ${installer.legalRepFullName}, ${installer.legalRepRole}`,
    // The CIN is optional: no line at all when the client has none.
    clientCinLine: cin ? `CIN : ${cin}` : '',
  };
}

function floorText(floors: number): string {
  return floors === 0 ? 'RDC' : `R+${floors}`;
}

/** `Bâtiment : …` line of the presentation section; empty for a project that predates the question. */
export function buildSiteBuildingLine(meta: Pick<ProjectMeta, 'buildingType' | 'floors'>): string {
  if (meta.buildingType === null || meta.buildingType === undefined || meta.floors === null || meta.floors === undefined) return '';
  return meta.buildingType === 'HOUSE'
    ? `Bâtiment : maison individuelle, toiture au niveau ${floorText(meta.floors)}`
    : `Bâtiment : immeuble collectif (appartement), toiture-terrasse au niveau ${floorText(meta.floors)}`;
}

/** Rows of the earthing table, from the earthing row (TT scheme: single-phase BT). */
export function buildEarthingDetails(
  earthing: EarthingRow | null,
  mode: ProjectMeta['earthingMode'],
): { label: string; value: string }[] {
  if (!earthing) return [];
  const dedicated = mode !== 'BUILDING_EARTH';
  return [
    { label: 'Schéma de liaison à la terre', value: 'TT' },
    {
      label: 'Prise de terre',
      value: dedicated ? `Piquet dédié (${fmtUpTo(earthing.rodCount, 0)} × ${fmtUpTo(earthing.rodLengthM, 2)} m)` : 'Terre existante du bâtiment',
    },
    { label: 'Conducteur principal de protection', value: `${fmtUpTo(earthing.mainEarthSectionMm2, 2)} mm²` },
    { label: 'Liaison équipotentielle des cadres', value: `${fmtUpTo(earthing.frameEarthSectionMm2, 2)} mm²` },
    ...(dedicated ? [{ label: 'Conducteur de terre vers le piquet', value: `${fmtUpTo(earthing.earthToPitSectionMm2, 2)} mm²` }] : []),
    { label: 'Résistance de terre visée', value: `≤ ${fmtUpTo(earthing.targetResistanceOhm, 2)} Ω` },
  ];
}

function formatConsumption(consumption: SnapshotConsumption | null): string {
  if (!consumption) return 'Non renseignée';
  const annual = fmt(consumption.annualConsumptionKWh, 0);
  if (consumption.source === 'MANUAL' || consumption.billedKWh === null || consumption.monthsBilled === null) {
    return `${annual} kWh/an (valeur saisie par l'installateur)`;
  }
  const billed = fmt(consumption.billedKWh, 0);
  const months = fmt(consumption.monthsBilled, 0);
  if (consumption.periodStart && consumption.periodEnd) {
    return `${billed} kWh facturés sur ${months} mois (du ${formatIsoDate(consumption.periodStart)} au ${formatIsoDate(consumption.periodEnd)}) → environ ${annual} kWh/an (estimation à partir de ${months} mois de facture)`;
  }
  return `${billed} kWh facturés sur ${months} mois → environ ${annual} kWh/an (estimation)`;
}

function buildSizingAndProduction(input: BuildTemplateDataInput): Pick<
  DossierTemplateData,
  | 'sizingBranchement' | 'sizingSubscribedPower' | 'sizingConsumption' | 'sizingInstalledKWp'
  | 'sizingInverterPac' | 'sizingDcAcRatio' | 'sizingRule' | 'productionAnnual'
  | 'productionSpecificYield' | 'productionPr' | 'productionCoverage' | 'productionMethod'
  | 'productionMonths' | 'productionTotalGlobInc' | 'productionTotalEGrid'
> {
  const { production, consumption, subscribedPowerKVA, phases, engineInput } = input;
  const pacKW = engineInput.array.reduce((sum, entry) => sum + entry.inverter.pacW, 0) / 1000;
  const kva = subscribedPowerKVA === null ? null : `${fmtUpTo(subscribedPowerKVA, 1)} kVA`;
  const pac = fmt(pacKW, 2);
  const limits = `rapport DC/AC limité à ${fmtUpTo(MAX_DC_AC_RATIO, 1)}.`;
  const coverage =
    consumption && consumption.annualConsumptionKWh > 0
      ? `${fmt((production.annualProductionKWh / consumption.annualConsumptionKWh) * 100, 0)} %`
      : '—';

  return {
    sizingBranchement: phases === 3 ? 'Triphasé BT' : 'Monophasé BT',
    sizingSubscribedPower: kva ?? 'Non renseignée',
    sizingConsumption: formatConsumption(consumption),
    sizingInstalledKWp: fmt(production.installedKWp, 2),
    sizingInverterPac: pac,
    sizingDcAcRatio: pacKW > 0 ? fmt(production.installedKWp / pacKW, 2) : '—',
    sizingRule: kva
      ? `Puissance AC de l'onduleur (${pac} kW) inférieure ou égale à la puissance souscrite (${kva}) ; ${limits}`
      : `Puissance AC de l'onduleur (${pac} kW) ; ${limits}`,
    productionAnnual: fmt(production.annualProductionKWh, 0),
    productionSpecificYield: fmt(production.specificYieldKWhPerKWp, 0),
    productionPr: `${fmt(production.performanceRatioPct, 1)} %`,
    productionCoverage: coverage,
    productionMethod: `Simulation PVGIS v5.3 (Centre commun de recherche de la Commission européenne, JRC) au point GPS ${fmtUpTo(production.lat, 5)}, ${fmtUpTo(production.lon, 5)} ; irradiation horaire de l'année ${production.weatherYear} ; inclinaison ${fmtUpTo(production.tiltDeg, 1)}°, azimut ${fmtUpTo(production.azimuthDeg, 1)}° (0° = plein sud) ; pertes de câblage DC et AC calculées, écrêtage à la puissance de l'onduleur. Rapport détaillé en annexe N°2.`,
    productionMonths: production.monthly.map((row, index) => ({
      monthLabel: MONTH_LABELS[index] ?? `Mois ${index + 1}`,
      globInc: fmt(row.globIncKWhM2, 1),
      eGrid: fmt(row.eGridKWh, 0),
      pr: fmt(row.prPct, 1),
    })),
    productionTotalGlobInc: fmt(production.monthly.reduce((sum, row) => sum + row.globIncKWhM2, 0), 1),
    productionTotalEGrid: fmt(production.annualProductionKWh, 0),
  };
}

// PLACEHOLDER_DEFINITIONS['P_DC_W']/['MODULE_COUNT'] only read ctx.derived (confirmed directly
// from placeholder-map.ts: both are `(c) => c.derived.XXX!`) — the other PlaceholderSourceContext
// fields are never touched for these two names, so the empty/placeholder values below are safe.
// Revisit this cast if either definition is ever changed to read engineInput/representativeMppt/
// projectMeta.
function formatPlaceholder(name: 'P_DC_W' | 'MODULE_COUNT', derived: Record<string, number>): string {
  const def = PLACEHOLDER_DEFINITIONS[name]!;
  const raw = def.source({ derived, engineInput: {} as RunEngineInput, representativeMppt: { stringsInParallel: 0, modulesPerString: 0 }, projectMeta: {} as ProjectMeta });
  const decimals = def.decimals ?? 0;
  const formatted = raw.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  // Matches placeholder-map.ts's own formatValue() convention exactly: a U+00A0 non-breaking
  // space before the unit suffix (not a plain space), confirmed against its own test fixture.
  return def.unit ? `${formatted} ${def.unit}` : formatted;
}

function fmt(value: number, decimals = 1): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'] as const;

/**
 * Computes each section's roman numeral in code instead of hardcoding it as literal template
 * text, so the DC fuse and AC isolator sections — each only present when their own
 * {#dcFuseRequired}/{#acIsolatorRequired} condition is true — never leave a gap in the sequence
 * (e.g. "VIII. Structure" directly followed by "IX. Conclusion" when both are absent, the most
 * common single-inverter/no-fuse configuration). Up to XII sections with both present.
 */
export function computeSectionNumbers(dcFuseRequired: boolean, acIsolatorRequired: boolean): {
  sectionNumberPreambule: string;
  sectionNumberPresentation: string;
  sectionNumberDimensionnement: string;
  sectionNumberSolution: string;
  sectionNumberProtections: string;
  sectionNumberCablage: string;
  sectionNumberTerre: string;
  sectionNumberStructure: string;
  sectionNumberFusible: string;
  sectionNumberSectionneur: string;
  sectionNumberCompliance: string;
  sectionNumberConclusion: string;
} {
  let n = 0;
  const next = (): string => `${ROMAN_NUMERALS[n++]!}.`;
  const sectionNumberPreambule = next();
  const sectionNumberPresentation = next();
  const sectionNumberDimensionnement = next();
  const sectionNumberSolution = next();
  const sectionNumberProtections = next();
  const sectionNumberCablage = next();
  const sectionNumberTerre = next();
  const sectionNumberStructure = next();
  const sectionNumberFusible = dcFuseRequired ? next() : '';
  const sectionNumberSectionneur = acIsolatorRequired ? next() : '';
  const sectionNumberCompliance = next();
  const sectionNumberConclusion = next();
  return {
    sectionNumberPreambule,
    sectionNumberPresentation,
    sectionNumberDimensionnement,
    sectionNumberSolution,
    sectionNumberProtections,
    sectionNumberCablage,
    sectionNumberTerre,
    sectionNumberStructure,
    sectionNumberFusible,
    sectionNumberSectionneur,
    sectionNumberCompliance,
    sectionNumberConclusion,
  };
}

export function buildTemplateData(input: BuildTemplateDataInput): DossierTemplateData {
  const { workerResult, engineInput, projectMeta, snapshot, installer } = input;
  const dcFuseRequired = engineInput.dcFuse !== null;
  const acIsolatorRequired = engineInput.acIsolator !== null;
  const derived = workerResult.engineResult.derived;
  // The engine only derives these when the project supplied the wind-stability inputs.
  const stabilityComputed =
    derived.F_WEIGHT_N !== undefined &&
    derived.STABILITY_LHS !== undefined &&
    derived.STABILITY_RHS !== undefined;

  const draftMissing = input.draftMissing ?? [];
  const cableNotesInput = { engineInput, engineResult: workerResult.engineResult, cableRuns: snapshot.cableRuns };
  return {
    isDraft: draftMissing.length > 0,
    draftMissingText: draftMissing.join(' ; '),
    companyName: installer.name,
    companyAddress: installer.address,
    companyPhone: installer.phone,
    companyEmail: installer.email,
    ...buildIdentityLines(input),
    clientFullName: snapshot.client?.fullName ?? '',
    clientAddress: snapshot.client?.address ?? '',
    clientStegReference: snapshot.client?.stegReference ?? '',
    introduction: workerResult.sections.introduction,
    solution: workerResult.sections.solution,
    cabling: workerResult.sections.cabling,
    earthing: workerResult.sections.earthing,
    siteBuildingLine: buildSiteBuildingLine(projectMeta),
    earthingDetails: buildEarthingDetails(snapshot.earthing, projectMeta.earthingMode),
    structure: workerResult.sections.structure,
    structureRows: buildStructureRows({
      engineInput,
      engineResult: workerResult.engineResult,
      material: projectMeta.structureMaterial,
      azimuthDeg: snapshot.azimuthDeg ?? null,
      hasAttestation: snapshot.hasStructureAttestation ?? false,
    }),
    stabilityNotes: buildStabilityNotes({ engineInput, engineResult: workerResult.engineResult }),
    documentationRows: input.equipmentTables?.documentationRows ?? [],
    equipmentRows: input.equipmentTables?.equipmentRows ?? [],
    moduleSpecRows: input.equipmentTables?.moduleSpecRows ?? [],
    inverterSpecTables: input.equipmentTables?.inverterSpecTables ?? [],
    deviceRatingRows: input.equipmentTables?.deviceRatingRows ?? [],
    complianceRows: workerResult.engineResult.checks.map((check) => ({
      id: check.id,
      label: CHECK_LABELS[check.id] ?? check.message,
      result: check.pass ? 'Conforme' : check.level === 'WARN' ? 'Avertissement' : 'Non conforme',
    })),
    conclusionText: workerResult.sections.conclusion,
    moduleBrandModel: projectMeta.moduleBrandModel,
    inverterBrandModel: projectMeta.inverterBrandModel,
    pDcW: formatPlaceholder('P_DC_W', workerResult.engineResult.derived),
    moduleCount: formatPlaceholder('MODULE_COUNT', workerResult.engineResult.derived),
    inverters: engineInput.array.map((entry, index) => ({
      // Each inverter's OWN brand/model/power (projectMeta.inverterBrandModel is the FIRST
      // inverter's model only — using it for every entry misrepresents a mixed-model array on the
      // regulatory drawings and spec table; see render-drawings' own per-inverter labels, which
      // read this same per-entry field).
      inverterLabel: `Onduleur ${index + 1}`,
      inverterBrandModel: snapshot.inverterBrandModels[index] ?? projectMeta.inverterBrandModel,
      pacW: fmt(entry.inverter.pacW, 0),
      mppts: entry.mppts.map((mppt, mpptIndex) => ({
        mpptLabel: `MPPT ${mpptIndex + 1}`,
        stringsInParallel: mppt.stringsInParallel,
        modulesPerString: mppt.modulesPerString,
      })),
    })),
    cableRuns: snapshot.cableRuns.map((run) => ({
      label: run.label,
      sectionMm2: fmtUpTo(run.sectionMm2, 2),
      lengthM: fmtUpTo(run.lengthM, 2),
      installMethod: installMethodText(run.installMethod),
    })),
    dcFuseRequired,
    acIsolatorRequired,
    ...computeSectionNumbers(dcFuseRequired, acIsolatorRequired),
    ...buildSizingAndProduction(input),
    temperatureAssumptions: buildTemperatureAssumptions(engineInput),
    stringSizingNotes: buildStringSizingNotes({ engineInput, engineResult: workerResult.engineResult, dcFuseLabel: projectMeta.protections.dcFuse }),
    protectionNotes: buildProtectionNotes({
      engineInput,
      engineResult: workerResult.engineResult,
      labels: projectMeta.protections,
      acSpdInKA: snapshot.acSpdInKA ?? null,
    }),
    // The bare drop table (old IV.1) is replaced by the per-run notes with their inputs (Task 21).
    cableSizingRows: buildCableSizingRows(cableNotesInput),
    voltageDropRows: buildVoltageDropRows(cableNotesInput),
    voltageDropLimitsText: buildVoltageDropLimitsText(engineInput),
    stabilityComputed,
    stabilityWeightN: stabilityComputed ? fmt(derived.F_WEIGHT_N!, 0) : '',
    stabilityLhs: stabilityComputed ? fmt(derived.STABILITY_LHS!, 0) : '',
    stabilityRhs: stabilityComputed ? fmt(derived.STABILITY_RHS!, 0) : '',
  };
}
