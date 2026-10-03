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

export function buildTemplateData(input: BuildTemplateDataInput): DossierTemplateData {
  const { workerResult, engineInput, projectMeta, snapshot, companyInfo } = input;

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
      inverterLabel: `Onduleur ${index + 1}`,
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
    dcFuseRequired: engineInput.dcFuse !== null,
    acIsolatorRequired: engineInput.acIsolator !== null,
  };
}
