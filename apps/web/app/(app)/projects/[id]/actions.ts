'use server';

import { redirect } from 'next/navigation';
import { db, type Prisma } from '@dossipv/db';
import { runEngine } from '@dossipv/engine';
import { requireAuthenticatedCompanyUser } from '../../layout';
import type { RunEngineInput } from '@dossipv/engine';
import {
  PROJECT_ENGINE_INCLUDE,
  buildEngineInput,
  type ProjectMetaForWorker,
} from '../../../../lib/project-engine-input';
import { summarizeSubscription, checkQuota, monthStart } from '../../../../lib/subscription';

export interface GenerateDossierActionState {
  error: string;
}

/** Shape of `DossierJob.inputSnapshot` written by the installer app — the worker reads this. */
export interface DossierJobSnapshotV1 {
  version: 1;
  projectId: string;
  companyId: string;
  tier: 'STANDARD' | 'PREMIUM';
  engineInput: RunEngineInput;
  projectMeta: ProjectMetaForWorker;
}

/**
 * Installer's "Générer" action (spec §5). Re-validates everything server-side — subscription,
 * quota, section completeness, the 22 checks — and only then enqueues a PENDING DossierJob
 * with the frozen engine input as its snapshot. The worker picks the job up from there; this
 * action never generates anything itself.
 */
export async function generateDossierAction(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState passes the previous state
  _prevState: GenerateDossierActionState | undefined,
): Promise<GenerateDossierActionState | undefined> {
  const user = await requireAuthenticatedCompanyUser();
  const now = new Date();

  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!project) {
    return { error: 'Projet introuvable.' };
  }

  const subscriptionRow = await db.subscription.findUnique({
    where: { companyId: user.companyId },
    include: { plan: true },
  });
  const subscription = summarizeSubscription(subscriptionRow, now);
  if (!subscription || !subscription.canGenerate) {
    return { error: "Votre abonnement n'est pas actif : génération impossible." };
  }

  const jobsThisMonth = await db.dossierJob.findMany({
    where: { project: { companyId: user.companyId }, startedAt: { gte: monthStart(now) } },
    select: { projectId: true, status: true, startedAt: true },
  });
  const quota = checkQuota(jobsThisMonth, subscription.monthlyDossierLimit, projectId, now);
  if (quota.blocked) {
    return { error: `Quota mensuel atteint (${quota.used}/${quota.limit} dossiers).` };
  }

  if (project.jobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING')) {
    return { error: 'Une génération est déjà en cours pour ce projet.' };
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

  const snapshot: DossierJobSnapshotV1 = {
    version: 1,
    projectId: project.id,
    companyId: project.companyId,
    tier: project.tier,
    engineInput: engineInput.input,
    projectMeta: engineInput.meta,
  };

  await db.$transaction([
    db.dossierJob.create({
      data: {
        projectId: project.id,
        status: 'PENDING',
        inputSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    }),
    db.project.update({
      where: { id: project.id },
      data: { dossierDate: project.dossierDate ?? now },
    }),
  ]);

  redirect(`/projects/${project.id}`);
  return undefined;
}
