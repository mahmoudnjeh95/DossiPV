import { db } from '@dossipv/db';

/** Past this the check fails rather than leaving the uptime monitor (or Docker) hanging. */
const DB_TIMEOUT_MS = 3000;

const HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Liveness + database check for the external uptime monitor and the container healthcheck.
 * Public on purpose (no session): it answers only ok/error and never says what failed.
 */
export async function GET(): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`database did not answer within ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
      }),
    ]);
    return Response.json({ status: 'ok' }, { status: 200, headers: HEADERS });
  } catch (error) {
    console.error('Health check failed:', error instanceof Error ? error.message : error);
    return Response.json({ status: 'error' }, { status: 503, headers: HEADERS });
  } finally {
    clearTimeout(timer);
  }
}
