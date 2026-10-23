import { cookies } from 'next/headers';
import { db } from '@dossipv/db';
import { validateSession } from '@dossipv/auth';
import { toJobProgressView } from '../../../lib/dossier-jobs';

/** Watched ids accepted per request: the browser only ever watches a handful of jobs. */
const MAX_IDS = 20;

/**
 * The live state of the caller's company jobs, polled by the browser for the progress bar and
 * the end-of-generation notifications: every queued or running job, plus the jobs named in
 * `?ids=` (so a watcher learns how the ones it was following ended). Scoped to the company.
 */
export async function GET(request: Request): Promise<Response> {
  const token = (await cookies()).get('dossipv_session')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) {
    return new Response(null, { status: 401 });
  }

  const ids = (new URL(request.url).searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')
    .slice(0, MAX_IDS);

  const jobs = await db.dossierJob.findMany({
    where: {
      project: { companyId: user.companyId },
      OR: [{ status: { in: ['PENDING', 'RUNNING'] } }, ...(ids.length > 0 ? [{ id: { in: ids } }] : [])],
    },
    orderBy: { startedAt: 'asc' },
    select: {
      id: true,
      projectId: true,
      status: true,
      failedStep: true,
      failureReason: true,
      progressStep: true,
      progressAt: true,
      startedAt: true,
      project: { select: { client: { select: { fullName: true } } } },
    },
  });

  const now = new Date();
  return Response.json(
    { jobs: jobs.map((job) => toJobProgressView(job, now)) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
