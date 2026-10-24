'use server';

import { redirect } from 'next/navigation';
import { db, type Prisma } from '@dossipv/db';
import { runEngine } from '@dossipv/engine';
import { requireInstallerUser } from '../../layout';
import type { RunEngineInput } from '@dossipv/engine';
import {
  PROJECT_ENGINE_INCLUDE,
  buildEngineInput,
  type ProjectMetaForWorker,
} from '../../../../lib/project-engine-input';
import { unsourcedEquipment } from '../../../../lib/project-access';
import { ANME_AGREEMENT_REQUIRED_MESSAGE, PROFILE_INCOMPLETE_MESSAGE } from '../../../../lib/labels';
import { inactiveSubscriptionMessage, trialQuotaMessage } from '../../../../lib/trial';
import { buildSnapshotConsumption, type SnapshotConsumption } from '../../../../lib/snapshot-consumption';
import { loadEffectiveSubscription } from '../../../../lib/sponsorship';
import { summarizeSubscription, checkQuota, quotaJobs, quotaWindowStart } from '../../../../lib/subscription';
import { assignDossierNumber } from '../../../../lib/dossier-number';
import { LOCATIONS_PENDING_MESSAGE, locationsPending, stegCompleteness } from '../../../../lib/steg-completeness';

const GENERATION_IN_PROGRESS = 'Une génération est déjà en cours pour ce projet.';

export interface GenerateDossierActionState {
  error: string;
}

type ProjectForSnapshot = Prisma.ProjectGetPayload<{ include: typeof PROJECT_ENGINE_INCLUDE }>;

/**
 * Shape of `DossierJob.inputSnapshot` written by the installer app. It is a superset of two
 * contracts so the worker can read whichever it needs:
 *
 * - the dossier-worker's `ProjectSnapshot` (sub-project #8, `build-snapshot.ts`): every
 *   project section as its full Prisma row, equipment captured BY VALUE so a later catalog
 *   edit never changes an already-generated dossier (master spec §5 step 1), plus
 *   `capturedAt`;
 * - the engine-ready `engineInput` and the placeholder-map `projectMeta`, already validated
 *   against the 22 checks at the moment the installer clicked "Générer".
 */
export interface DossierJobSnapshotV1 {
  version: 1;
  projectId: string;
  companyId: string;
  tier: 'STANDARD' | 'PREMIUM';
  /** The dossier gets the 3D view of the array on the roof (Project.with3d). */
  with3d: boolean;
  dossierNumber: string | null;
  dossierDate: string;
  capturedAt: string;
  client: ProjectForSnapshot['client'];
  site: ProjectForSnapshot['site'];
  arrayConfig: ProjectForSnapshot['arrayConfig'];
  protections: ProjectForSnapshot['protections'];
  cablingConfig: ProjectForSnapshot['cablingConfig'];
  cableRuns: ProjectForSnapshot['cableRuns'];
  structure: ProjectForSnapshot['structure'];
  earthing: ProjectForSnapshot['earthing'];
  /** What the dossier states as the client's consumption; null when the client has none. */
  consumption: SnapshotConsumption | null;
  engineInput: RunEngineInput;
  projectMeta: ProjectMetaForWorker;
  /** STEG pieces still missing: non-empty makes the dossier a watermarked draft. */
  draftMissing: string[];
}

/**
 * Installer's "Générer" action (spec §5). Re-validates everything server-side — subscription,
 * quota, section completeness, the 22 checks — and only then enqueues a PENDING DossierJob
 * with the frozen engine input as its snapshot, then opens the job page. A bill-flow project
 * whose points are not saved yet is refused. Missing STEG papers never block: they are frozen as
 * `draftMissing` and the worker watermarks the dossier as a draft. This action never generates
 * anything itself.
 */
export async function generateDossierAction(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState passes the previous state
  _prevState: GenerateDossierActionState | undefined,
): Promise<GenerateDossierActionState | undefined> {
  const user = await requireInstallerUser();
  const now = new Date();

  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!project) {
    return { error: 'Projet introuvable.' };
  }

  // A re-applied proposal resets the cable lengths and the earthing until the points are saved again.
  if (locationsPending(project.flowStep)) {
    return { error: LOCATIONS_PENDING_MESSAGE };
  }

  // A self sign-up company still has placeholder identity data on its cover page and cartouche.
  if (!project.company.profileComplete) {
    return { error: PROFILE_INCOMPLETE_MESSAGE };
  }

  // The ANME agreement opens the administrative annex: no dossier without it.
  if (!project.company.anmeCertificateFileId) {
    return { error: ANME_AGREEMENT_REQUIRED_MESSAGE };
  }

  const unsourced = unsourcedEquipment(project);
  if (unsourced.length > 0) {
    return { error: `Équipement sans fiche technique : ${unsourced.join(', ')}. Remplacez-le avant de générer.` };
  }

  const subscriptionRow = await loadEffectiveSubscription(user.companyId);
  const subscription = summarizeSubscription(subscriptionRow, now);
  if (!subscription || !subscription.canGenerate) {
    return { error: inactiveSubscriptionMessage(subscription, 'génération') };
  }

  // A trial counts over its whole period, a regular plan per calendar month.
  const jobsInWindow = await quotaJobs(user.companyId, subscription, now);
  const quota = checkQuota(jobsInWindow, subscription.monthlyDossierLimit, projectId, now, quotaWindowStart(subscription, now));
  if (quota.blocked) {
    return {
      error: subscription.isTrial
        ? trialQuotaMessage(quota.limit)
        : `Quota mensuel atteint (${quota.used}/${quota.limit} dossiers).`,
    };
  }

  if (project.jobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING')) {
    return { error: GENERATION_IN_PROGRESS };
  }

  const engineInput = buildEngineInput(project, now);
  if (!engineInput.ok) {
    return { error: `Dossier incomplet : ${engineInput.missing.join(' ')}` };
  }

  let hasBlockingFailure: boolean;
  try {
    hasBlockingFailure = runEngine(engineInput.input).hasBlockingFailure;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erreur de calcul.' };
  }
  if (hasBlockingFailure) {
    return { error: 'Des contrôles bloquants ont échoué : corrigez-les avant de générer.' };
  }

  // Resolved once, used both for the snapshot and the Project row update below, so the dossier's
  // cover-page date always matches the date the engine's own checks (C20/C22) actually ran against.
  const dossierDate = project.dossierDate ?? now;
  const hasAnmeList = (await db.catalogSourceDocument.count({ where: { kind: 'ANME_PANEL_LIST' } })) > 0;
  const { missingLabels } = stegCompleteness(project, dossierDate, hasAnmeList);

  const jobId = await db.$transaction(async (tx) => {
    // The installer's own numbering, taken on the project's first generation only; a regeneration
    // or a retry after a failed job keeps the stored number and never moves the counter.
    const dossierNumber = await assignDossierNumber(tx, project.companyId, project.id);
    // assignDossierNumber holds the project row (FOR UPDATE): a double submit waits there, finds the
    // number the first one stored (so the counter does not move) and then sees its queued job here.
    const active = await tx.dossierJob.count({ where: { projectId: project.id, status: { in: ['PENDING', 'RUNNING'] } } });
    if (active > 0) return null;
    const snapshot: DossierJobSnapshotV1 = {
      version: 1,
      projectId: project.id,
      companyId: project.companyId,
      tier: project.tier,
      with3d: project.with3d,
      dossierNumber,
      dossierDate: dossierDate.toISOString(),
      capturedAt: now.toISOString(),
      client: project.client,
      site: project.site,
      arrayConfig: project.arrayConfig,
      protections: project.protections,
      cablingConfig: project.cablingConfig,
      cableRuns: project.cableRuns,
      structure: project.structure,
      earthing: project.earthing,
      consumption: buildSnapshotConsumption(project.client, project.billImport),
      engineInput: engineInput.input,
      projectMeta: engineInput.meta,
      draftMissing: missingLabels,
    };
    const job = await tx.dossierJob.create({
      data: {
        projectId: project.id,
        status: 'PENDING',
        inputSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.project.update({
      where: { id: project.id },
      data: { dossierDate },
    });
    return job.id;
  });
  if (jobId === null) {
    return { error: GENERATION_IN_PROGRESS };
  }

  redirect(`/projects/${project.id}/jobs/${jobId}`);
  return undefined;
}
