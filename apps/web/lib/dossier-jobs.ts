import type { RunEngineInput } from '@dossipv/engine';
import type { DossierJobSnapshotV1 } from '../app/(app)/projects/[id]/actions';

/**
 * The 8 steps of the generation pipeline (master spec §5), in the order the worker runs them.
 * `key` is what the worker writes into `DossierJob.progressStep` as it enters the step, and into
 * `failedStep` when the step fails; `workerSteps` are the finer failedStep keys the worker uses
 * within the step. Matching is case-insensitive and also accepts the French label, so a worker
 * writing either form lights up the right step. `seconds` is the step's typical duration: it
 * weights the progress bar.
 */
export const PIPELINE_STEPS: { key: string; label: string; seconds: number; workerSteps?: string[] }[] = [
  { key: 'snapshot', label: 'Gel des données du projet', seconds: 1 },
  { key: 'simulation', label: 'Simulation de production (PVGIS)', seconds: 8 },
  { key: 'text', label: 'Rédaction des textes', seconds: 45 },
  { key: 'docx', label: 'Document Word', seconds: 2 },
  { key: 'pdf', label: 'Conversion PDF', seconds: 12 },
  { key: 'drawings', label: 'Schémas et plans', seconds: 20, workerSteps: ['cover', 'simulation-report', 'map-pages', 'page-37-layout'] },
  { key: 'annexes', label: 'Fusion des annexes', seconds: 12, workerSteps: ['toc', 'assembly'] },
  { key: 'save', label: 'Enregistrement du dossier', seconds: 2 },
];

/** failureReason stored when the installer cancels a PENDING job (see jobs/[jobId]/actions.ts). */
export const CANCELLED_BY_INSTALLER_REASON = "Annulée par l'installateur avant traitement.";

export type StepState = 'done' | 'running' | 'failed' | 'pending';

export interface PipelineStepView {
  key: string;
  label: string;
  state: StepState;
}

export type JobStatusValue = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface JobLike {
  status: JobStatusValue;
  failedStep: string | null;
  progressStep?: string | null;
}

/** The PIPELINE_STEPS index a worker step key (or label) names, or -1. */
function stepIndex(workerStep: string): number {
  const needle = workerStep.trim().toLowerCase();
  const exact = PIPELINE_STEPS.findIndex(
    (step) => needle === step.key || needle === step.label.toLowerCase() || (step.workerSteps ?? []).includes(needle),
  );
  return exact !== -1 ? exact : PIPELINE_STEPS.findIndex((step) => needle.includes(step.key));
}

/**
 * Derives a per-step state from the job's status, progressStep and failedStep. A RUNNING job
 * without a recognised progressStep shows its first step running. A FAILED job with an
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
    const runningIndex = Math.max(0, job.progressStep ? stepIndex(job.progressStep) : 0);
    return PIPELINE_STEPS.map((step, index) => ({
      ...step,
      state: index < runningIndex ? 'done' : index === runningIndex ? 'running' : 'pending',
    }));
  }
  const failedIndex = job.failedStep === null ? -1 : stepIndex(job.failedStep);
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

/**
 * A job's live state as the progress bar and the end-of-generation notifications see it (the
 * /api/dossier-jobs payload). The durations are measured on the server when the view is built,
 * so the browser extrapolates from them without trusting its own clock against the server's.
 */
export interface JobProgressView {
  id: string;
  projectId: string;
  clientName: string;
  status: JobStatusValue;
  cancelled: boolean;
  failedStep: string | null;
  progressStep: string | null;
  /** Time since the job was claimed by the worker (or queued, while PENDING). */
  elapsedMs: number;
  /** Time since the worker entered progressStep; null before it reported one. */
  stepElapsedMs: number | null;
  /** Server time the view was built: of two views of a job, the later one wins. */
  asOf: number;
}

export interface JobProgressRow {
  id: string;
  projectId: string;
  status: JobStatusValue;
  failedStep: string | null;
  failureReason: string | null;
  progressStep: string | null;
  progressAt: Date | null;
  startedAt: Date;
  project: { client: { fullName: string } | null };
}

export function toJobProgressView(job: JobProgressRow, now: Date): JobProgressView {
  return {
    id: job.id,
    projectId: job.projectId,
    clientName: job.project.client?.fullName ?? 'Projet',
    status: job.status,
    cancelled: job.failureReason === CANCELLED_BY_INSTALLER_REASON,
    failedStep: job.failedStep,
    progressStep: job.progressStep,
    elapsedMs: Math.max(0, now.getTime() - job.startedAt.getTime()),
    stepElapsedMs: job.progressAt ? Math.max(0, now.getTime() - job.progressAt.getTime()) : null,
    asOf: now.getTime(),
  };
}

export function isJobActive(status: JobStatusValue): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

/**
 * The progress bar's percentage: the steps already done, weighted by their typical duration,
 * plus a share of the current step that grows with the time spent in it and slows down as it
 * passes the typical duration, so the bar keeps moving without ever claiming the step is over.
 * 0 while queued, 100 once succeeded; a running job stays within 1–99.
 */
export function jobProgressPercent(job: { status: JobStatusValue; progressStep: string | null }, stepElapsedMs: number | null): number {
  if (job.status === 'SUCCEEDED') return 100;
  if (job.status !== 'RUNNING') return 0;
  const total = PIPELINE_STEPS.reduce((sum, step) => sum + step.seconds, 0);
  const index = Math.max(0, job.progressStep ? stepIndex(job.progressStep) : 0);
  const done = PIPELINE_STEPS.slice(0, index).reduce((sum, step) => sum + step.seconds, 0);
  const current = PIPELINE_STEPS[index]!.seconds;
  const share = stepElapsedMs === null ? 0 : Math.min(0.95, 1 - Math.exp(-stepElapsedMs / 1000 / current));
  return Math.min(99, Math.max(1, ((done + share * current) / total) * 100));
}

/** The worker's warnings as strings; anything else is dropped (raw, as stored). */
function rawWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((warning): warning is string => typeof warning === 'string' && warning !== '') : [];
}

/**
 * A worker warning in words an installer can act on (or told that nothing is needed). The worker
 * keeps writing its terse text; only the shown text changes, and an unknown warning is kept as is.
 */
export function friendlyWarning(warning: string): string {
  const list = /^Page de la liste (STEG|ANME) introuvable pour (.+)\.$/.exec(warning);
  if (list) {
    const [, name, model] = list;
    return `Le modèle ${model} n’a pas été trouvé dans la liste ${name} officielle : sa page n’est pas jointe au dossier. Aucune action n’est obligatoire ; si vous la souhaitez, ajoutez cette page vous-même dans les annexes.`;
  }
  const highlight = /^Surlignage impossible dans (.+) \(document scanné ou modèle introuvable\)\.$/.exec(warning);
  if (highlight) {
    return `${highlight[1]} : le modèle n’a pas pu être surligné dans la fiche technique (document scanné ou texte illisible). La fiche est bien jointe au dossier : aucune action n’est nécessaire, ou surlignez-la à la main avant de l’envoyer.`;
  }
  const missingFile = /^(.+) : fichier introuvable, non joint au dossier\.$/.exec(warning);
  if (missingFile) return `${missingFile[1]} : le fichier est introuvable et n’est pas joint au dossier. Rajoutez-le dans les annexes du projet puis régénérez le dossier.`;
  const unreadable = /^(.+) : document illisible, non joint au dossier\.$/.exec(warning);
  if (unreadable) return `${unreadable[1]} : le document est illisible et n’est pas joint au dossier. Remplacez-le par un PDF ou une image valide puis régénérez le dossier.`;
  const summary = /^Sommaire : titre « (.+) » introuvable\.$/.exec(warning);
  if (summary) return `Sommaire : la section « ${summary[1]} » n’a pas pu être repérée dans le PDF, son numéro de page manque. Aucune action n’est nécessaire.`;
  return warning;
}

/** `DossierJob.warnings` (a JSON string[] the worker writes), worded for the installer; anything else is dropped. */
export function jobWarnings(value: unknown): string[] {
  return rawWarnings(value).map(friendlyWarning);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The STEG pieces a job's snapshot recorded as missing (its dossier is then a draft); [] for older snapshots. */
export function snapshotDraftMissing(value: unknown): string[] {
  return isRecord(value) ? rawWarnings(value['draftMissing']) : [];
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
      ? `${snapshot.earthing.useBuildingEarth ? 'Terre existante du bâtiment' : `${snapshot.earthing.rodCount} piquet(s) de ${snapshot.earthing.rodLengthM} m`}, cible ${snapshot.earthing.targetResistanceOhm} Ω, câble ${equipmentLabel(snapshot.earthing.earthCable)}`
      : null,
    dossierDate: input.dossierDate,
  };
}
