import { pathToFileURL } from 'url';
import { db } from '@dossipv/db';
import { processJob } from './process-job';

const POLL_INTERVAL_MS = Number(process.env.DOSSIER_WORKER_POLL_INTERVAL_MS ?? 5000);
const STALE_RUNNING_MS = Number(process.env.DOSSIER_WORKER_STALE_RUNNING_MS ?? 600_000);

export async function claimNextJob(): Promise<string | null> {
  const candidate = await db.dossierJob.findFirst({
    where: { status: 'PENDING' },
    orderBy: { startedAt: 'asc' },
    select: { id: true },
  });
  if (!candidate) {
    return null;
  }

  const claimed = await db.dossierJob.updateMany({
    where: { id: candidate.id, status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  return claimed.count === 1 ? candidate.id : null;
}

export async function resetStaleRunningJobs(staleThresholdMs: number): Promise<number> {
  const result = await db.dossierJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - staleThresholdMs) } },
    data: { status: 'PENDING' },
  });
  return result.count;
}

let shuttingDown = false;

async function pollOnce(): Promise<void> {
  const jobId = await claimNextJob();
  if (jobId) {
    try {
      await processJob(jobId);
    } catch (error) {
      // processJob is written to catch and record every failure itself; an exception escaping
      // it means something is badly wrong (e.g. the DB connection itself dropped). Log and keep
      // the worker alive rather than letting one bad job crash the whole process.
      console.error(`processJob threw unexpectedly for job ${jobId}:`, error);
    }
  }
}

export async function main(): Promise<void> {
  await resetStaleRunningJobs(STALE_RUNNING_MS);

  process.on('SIGTERM', () => {
    shuttingDown = true;
  });
  process.on('SIGINT', () => {
    shuttingDown = true;
  });

  while (!shuttingDown) {
    await pollOnce();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// process.argv[1] is a plain path (relative or absolute, OS-specific separators); import.meta.url
// is always an absolute, percent-encoded file:// URL — comparing them directly as strings (the
// naive `file://${process.argv[1]}` form) never matches. pathToFileURL() normalizes argv[1] into
// the same URL form before comparing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Dossier worker crashed:', error);
    process.exit(1);
  });
}
