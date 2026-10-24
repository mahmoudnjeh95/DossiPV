'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireInstallerUser } from '../../../../layout';
import { CANCELLED_BY_INSTALLER_REASON } from '../../../../../../lib/dossier-jobs';

export interface CancelJobActionState {
  error: string;
}

/**
 * Cancels a job that the worker has not picked up yet. Implemented as a conditional
 * `updateMany` on `status: PENDING` so a job the worker flipped to RUNNING in the meantime is
 * left alone (0 rows updated → error), never half-cancelled. A cancelled job is stored as
 * FAILED with an explicit reason, which also means it never consumes quota (spec §5).
 */
export async function cancelJobAction(
  projectId: string,
  jobId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState passes the previous state
  _prevState: CancelJobActionState | undefined,
): Promise<CancelJobActionState | undefined> {
  const user = await requireInstallerUser();

  const result = await db.dossierJob.updateMany({
    where: { id: jobId, status: 'PENDING', project: { id: projectId, companyId: user.companyId } },
    data: {
      status: 'FAILED',
      failedStep: 'snapshot',
      failureReason: CANCELLED_BY_INSTALLER_REASON,
      completedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return {
      error: 'Cette génération ne peut plus être annulée : elle est déjà en cours ou terminée.',
    };
  }

  redirect(`/projects/${projectId}/jobs/${jobId}`);
  return undefined;
}
