import type { RunEngineInput } from '@dossipv/engine';
import { PLACEHOLDER_DEFINITIONS, type ProjectMeta } from './placeholder-map';
import type { DossierWorkerResult } from './generate-dossier-document';
import type { DossierTemplateData } from '@dossipv/docx-template';

export interface BuildTemplateDataInput {
  workerResult: DossierWorkerResult;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  snapshot: {
    client: { fullName: string; address: string | null; stegReference: string | null } | null;
    cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
    // Each inverter's own brand/model, by snapshot array index — projectMeta.inverterBrandModel
    // is only the FIRST inverter's model (see I7: a mixed-model array must not show the wrong
    // model on every other inverter's row).
    inverterBrandModels: string[];
  };
  companyInfo: { name: string; address: string; phone: string; email: string };
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

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

/**
 * Computes each section's roman numeral in code instead of hardcoding it as literal template
 * text, so the VII (DC fuse) and VIII (AC isolator) sections — each only present when their own
 * {#dcFuseRequired}/{#acIsolatorRequired} condition is true — never leave a gap in the sequence
 * (e.g. "VI. Structure" directly followed by literal "IX. Conclusion" when both are absent, the
 * most common single-inverter/no-fuse configuration).
 */
export function computeSectionNumbers(dcFuseRequired: boolean, acIsolatorRequired: boolean): {
  sectionNumberPreambule: string;
  sectionNumberPresentation: string;
  sectionNumberSolution: string;
  sectionNumberCablage: string;
  sectionNumberTerre: string;
  sectionNumberStructure: string;
  sectionNumberFusible: string;
  sectionNumberSectionneur: string;
  sectionNumberConclusion: string;
} {
  let n = 0;
  const next = (): string => `${ROMAN_NUMERALS[n++]!}.`;
  const sectionNumberPreambule = next();
  const sectionNumberPresentation = next();
  const sectionNumberSolution = next();
  const sectionNumberCablage = next();
  const sectionNumberTerre = next();
  const sectionNumberStructure = next();
  const sectionNumberFusible = dcFuseRequired ? next() : '';
  const sectionNumberSectionneur = acIsolatorRequired ? next() : '';
  const sectionNumberConclusion = next();
  return {
    sectionNumberPreambule,
    sectionNumberPresentation,
    sectionNumberSolution,
    sectionNumberCablage,
    sectionNumberTerre,
    sectionNumberStructure,
    sectionNumberFusible,
    sectionNumberSectionneur,
    sectionNumberConclusion,
  };
}

export function buildTemplateData(input: BuildTemplateDataInput): DossierTemplateData {
  const { workerResult, engineInput, projectMeta, snapshot, companyInfo } = input;
  const dcFuseRequired = engineInput.dcFuse !== null;
  const acIsolatorRequired = engineInput.acIsolator !== null;

  return {
    companyName: companyInfo.name,
    companyAddress: companyInfo.address,
    companyPhone: companyInfo.phone,
    companyEmail: companyInfo.email,
    clientFullName: snapshot.client?.fullName ?? '',
    clientAddress: snapshot.client?.address ?? '',
    clientStegReference: snapshot.client?.stegReference ?? '',
    introduction: workerResult.sections.introduction,
    solution: workerResult.sections.solution,
    cabling: workerResult.sections.cabling,
    earthing: workerResult.sections.earthing,
    structure: workerResult.sections.structure,
    conclusion: workerResult.sections.conclusion,
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
      sectionMm2: run.sectionMm2,
      lengthM: run.lengthM,
      installMethod: run.installMethod,
    })),
    dcFuseRequired,
    acIsolatorRequired,
    ...computeSectionNumbers(dcFuseRequired, acIsolatorRequired),
    moduleSpecPmaxW: fmt(engineInput.module.pmaxW, 0),
    moduleSpecVmpV: fmt(engineInput.module.vmpV),
    moduleSpecImpA: fmt(engineInput.module.impA),
    moduleSpecVocV: fmt(engineInput.module.vocV),
    moduleSpecIscA: fmt(engineInput.module.iscA),
    inverterSpecVdcMaxV: fmt(engineInput.array[0]!.inverter.vdcMaxV),
    inverterSpecMpptMinV: fmt(engineInput.array[0]!.inverter.mpptMinV),
    inverterSpecMpptMaxV: fmt(engineInput.array[0]!.inverter.mpptMaxV),
    stringSizingNsMin: fmt(workerResult.engineResult.derived.NS_MIN!, 0),
    stringSizingNsMax: fmt(workerResult.engineResult.derived.NS_MAX!, 0),
    stringSizingNsOptMax: fmt(workerResult.engineResult.derived.NS_OPT_MAX!, 0),
    stringSizingNpMax: fmt(workerResult.engineResult.derived.NP_MAX!, 0),
    stringSizingNpOpt: fmt(workerResult.engineResult.derived.NP_OPT!, 0),
    voltageDropDuDcV: fmt(workerResult.engineResult.derived.DU_DC_V!),
    voltageDropDuDcPct: fmt(workerResult.engineResult.derived.DU_DC_PCT!, 2),
    voltageDropDuAcV: fmt(workerResult.engineResult.derived.DU_AC_V!),
    voltageDropDuAcPct: fmt(workerResult.engineResult.derived.DU_AC_PCT!, 2),
    stabilityWeightN: fmt(workerResult.engineResult.derived.F_WEIGHT_N!, 0),
    stabilityLhs: fmt(workerResult.engineResult.derived.STABILITY_LHS!, 0),
    stabilityRhs: fmt(workerResult.engineResult.derived.STABILITY_RHS!, 0),
  };
}
