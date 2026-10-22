import type { RunEngineInput } from '@dossipv/engine';
import type { DossierJobSnapshotV1 } from '../app/(app)/projects/[id]/actions';

/**
 * The 8 steps of the generation pipeline (master spec §5), in order. `key` is the value the
 * worker is expected to write into `DossierJob.failedStep` when a step fails, so the results
 * page can mark exactly where the pipeline stopped. Matching is case-insensitive and also
 * accepts the French label, so a worker writing either form lights up the right step.
 */
export const PIPELINE_STEPS: { key: string; label: string }[] = [
  { key: 'snapshot', label: 'Gel des données du projet' },
  { key: 'simulation', label: 'Simulation de production (PVGIS)' },
  { key: 'text', label: 'Rédaction des textes' },
  { key: 'drawings', label: 'Schémas et plans' },
  { key: 'docx', label: 'Document Word' },
  { key: 'pdf', label: 'Conversion PDF' },
  { key: 'annexes', label: 'Fusion des annexes' },
  { key: 'save', label: 'Enregistrement du dossier' },
];

/** failureReason stored when the installer cancels a PENDING job (see jobs/[jobId]/actions.ts). */
export const CANCELLED_BY_INSTALLER_REASON = "Annulée par l'installateur avant traitement.";

export type StepState = 'done' | 'running' | 'failed' | 'pending';

export interface PipelineStepView {
  key: string;
  label: string;
  state: StepState;
}

export interface JobLike {
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  failedStep: string | null;
}

function matchesStep(step: { key: string; label: string }, failedStep: string): boolean {
  const needle = failedStep.trim().toLowerCase();
  return needle === step.key || needle === step.label.toLowerCase() || needle.includes(step.key);
}

/**
 * Derives a per-step state from the job's status and failedStep. A FAILED job with an
 * unrecognised failedStep marks no step as failed (the raw text is shown separately by the
 * page) and leaves every step pending, rather than guessing.
 */
export function derivePipelineSteps(job: JobLike): PipelineStepView[] {
  if (job.status === 'SUCCEEDED') {
    return PIPELINE_STEPS.map((step) => ({ ...step, state: 'done' }));
  }
  if (job.status === 'PENDING') {
    return PIPELINE_STEPS.map((step) => ({ ...step, state: 'pending' }));
  }
  if (job.status === 'RUNNING') {
    return PIPELINE_STEPS.map((step, index) => ({
      ...step,
      state: index === 0 ? 'running' : 'pending',
    }));
  }
  const failedIndex =
    job.failedStep === null
      ? -1
      : PIPELINE_STEPS.findIndex((step) => matchesStep(step, job.failedStep!));
  return PIPELINE_STEPS.map((step, index) => ({
    ...step,
    state:
      failedIndex === -1
        ? 'pending'
        : index < failedIndex
          ? 'done'
          : index === failedIndex
            ? 'failed'
            : 'pending',
  }));
}

/** `DossierJob.warnings` (a JSON string[] the worker writes) as strings; anything else is dropped. */
export function jobWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((warning): warning is string => typeof warning === 'string' && warning !== '') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrows a `DossierJob.inputSnapshot` JSON value to the shape the installer app writes.
 * Returns null for any other shape (a job created by a different writer, or a future version)
 * so the page degrades to "format inconnu" instead of crashing on a missing key.
 */
export function parseJobSnapshot(value: unknown): DossierJobSnapshotV1 | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }
  if (
    typeof value.projectId !== 'string' ||
    !isRecord(value.engineInput) ||
    !isRecord(value.projectMeta)
  ) {
    return null;
  }
  const engineInput = value.engineInput;
  if (!isRecord(engineInput.module) || !Array.isArray(engineInput.array)) {
    return null;
  }
  return value as unknown as DossierJobSnapshotV1;
}

export interface SnapshotSummary {
  moduleBrandModel: string;
  moduleCount: number;
  dcPowerW: number;
  inverters: { label: string; mppts: { ns: number; np: number }[] }[];
  tMinC: number;
  tMaxC: number;
  phases: number;
  protections: { label: string; value: string }[];
  cableRuns: { label: string; detail: string }[];
  structure: string | null;
  earthing: string | null;
  dossierDate: string;
}

function equipmentLabel(row: { brand: string; model: string } | null | undefined): string {
  return row ? `${row.brand} ${row.model}` : '—';
}

/** Flattens the frozen snapshot into display-ready rows for the "Données figées" card. */
export function summarizeSnapshot(snapshot: DossierJobSnapshotV1): SnapshotSummary {
  const input: RunEngineInput = snapshot.engineInput;
  const moduleCount = input.array.reduce(
    (total, entry) =>
      total +
      entry.mppts.reduce((sub, mppt) => sub + mppt.stringsInParallel * mppt.modulesPerString, 0),
    0,
  );
  const inverterRows = snapshot.arrayConfig?.inverters ?? [];

  const protections: { label: string; value: string }[] = [];
  if (snapshot.protections) {
    const p = snapshot.protections;
    protections.push({ label: 'Parafoudre DC', value: equipmentLabel(p.dcSpd) });
    protections.push({ label: 'Interrupteur-sectionneur DC', value: equipmentLabel(p.dcSwitch) });
    protections.push({
      label: 'Fusibles DC',
      value: p.dcFuse ? equipmentLabel(p.dcFuse) : 'Non requis',
    });
    protections.push({ label: 'Disjoncteur AC', value: equipmentLabel(p.acBreaker) });
    protections.push({ label: 'Parafoudre AC', value: equipmentLabel(p.acSpd) });
    protections.push({
      label: 'Interrupteur-sectionneur AC',
      value: p.acIsolator ? equipmentLabel(p.acIsolator) : 'Non requis',
    });
  }

  return {
    moduleBrandModel: snapshot.projectMeta.moduleBrandModel,
    moduleCount,
    dcPowerW: moduleCount * input.module.pmaxW,
    inverters: input.array.map((entry, index) => ({
      label:
        equipmentLabel(inverterRows[index]?.inverter) === '—'
          ? snapshot.projectMeta.inverterBrandModel
          : equipmentLabel(inverterRows[index]?.inverter),
      mppts: entry.mppts.map((mppt) => ({ ns: mppt.modulesPerString, np: mppt.stringsInParallel })),
    })),
    tMinC: input.tMinC,
    tMaxC: input.tMaxC,
    phases: input.site.phases,
    protections,
    cableRuns: (snapshot.cableRuns ?? []).map((run) => ({
      label: `${run.circuitType} · ${run.label}`,
      detail: `${equipmentLabel(run.cable)} · ${run.sectionMm2} mm² · ${run.lengthM} m · pose ${run.installMethod}`,
    })),
    structure: snapshot.structure
      ? [
          snapshot.projectMeta.structureMaterial,
          ...(snapshot.structure.frameCount !== null ? [`${snapshot.structure.frameCount} châssis`] : []),
          `vent ${snapshot.structure.windSpeedKmh} km/h`,
        ].join(', ')
      : null,
    earthing: snapshot.earthing
      ? `${snapshot.earthing.rodCount} piquet(s) de ${snapshot.earthing.rodLengthM} m, cible ${snapshot.earthing.targetResistanceOhm} Ω, câble ${equipmentLabel(snapshot.earthing.earthCable)}`
      : null,
    dossierDate: input.dossierDate,
  };
}
