import type Anthropic from '@anthropic-ai/sdk';
import {
  runEngine,
  dcFuseRequired,
  type RunEngineInput,
  type EngineResult,
  type CheckResult,
} from '@dossipv/engine';
import {
  generateDossierText,
  substitutePlaceholders,
  type DossierTextInput,
  type DossierTextSections,
} from '@dossipv/document-text';
import {
  PLACEHOLDER_DEFINITIONS,
  buildPlaceholderValues,
  type ProjectMeta,
} from './placeholder-map';

export interface DossierWorkerInput {
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
}

export interface DossierWorkerResult {
  sections: DossierTextSections;
  engineResult: EngineResult;
}

/**
 * Thrown when the engine reports a blocking check failure for this design. Carries the full
 * check list so a caller can show the installer exactly which check(s) failed and why —
 * generation never reaches the Claude call in this case (no wasted API cost on an invalid
 * design), per spec §4 step 2.
 */
export class DossierGenerationBlockedError extends Error {
  public readonly checks: CheckResult[];

  constructor(checks: CheckResult[]) {
    const failing = checks.filter((c) => c.level === 'BLOCK' && !c.pass);
    super(
      `Cannot generate dossier text: ${failing.length} blocking check(s) failed (${failing
        .map((c) => c.id)
        .join(', ')}).`,
    );
    this.name = 'DossierGenerationBlockedError';
    this.checks = checks;
  }
}

/**
 * Runs the engine, refuses to proceed on a blocking failure, derives the non-engine
 * DossierTextInput fields, generates French dossier prose from Claude, and substitutes every
 * placeholder with its real engine-computed value. The single entry point for spec §5's
 * text-generation steps (snapshot/simulation/drawings/docx/PDF/annexes are out of scope here —
 * see the design spec).
 */
export async function generateDossierDocument(
  input: DossierWorkerInput,
  client: Anthropic,
): Promise<DossierWorkerResult> {
  const engineResult = runEngine(input.engineInput);

  if (engineResult.hasBlockingFailure) {
    throw new DossierGenerationBlockedError(engineResult.checks);
  }

  const firstEntry = input.engineInput.array[0]!;
  const representativeMppt = firstEntry.mppts[0]!;

  const textInput: DossierTextInput = {
    moduleBrandModel: input.projectMeta.moduleBrandModel,
    inverterBrandModel: input.projectMeta.inverterBrandModel,
    inverterCount: input.engineInput.array.length,
    gridType: input.projectMeta.gridType,
    phases: input.engineInput.site.phases,
    mountingType: input.projectMeta.mountingType,
    structureMaterial: input.projectMeta.structureMaterial,
    earthRodCount: input.projectMeta.earthRodCount,
    dcFuseRequired: dcFuseRequired(input.engineInput.module, representativeMppt.stringsInParallel),
    acIsolatorRequired: input.engineInput.array.length > 1,
  };

  const allowedPlaceholderNames = Object.keys(PLACEHOLDER_DEFINITIONS);
  const sections = await generateDossierText(textInput, client, allowedPlaceholderNames);

  const values = buildPlaceholderValues({
    derived: engineResult.derived,
    engineInput: input.engineInput,
    representativeMppt,
    projectMeta: input.projectMeta,
  });

  return {
    sections: substitutePlaceholders(sections, values),
    engineResult,
  };
}
