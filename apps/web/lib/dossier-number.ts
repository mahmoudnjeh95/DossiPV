import type { Prisma } from '@dossipv/db';

/**
 * The installer's dossier number as printed on the cover: `434 - 303` for prefix `434` and
 * number 303, or just `303` when the company has no prefix.
 */
export function formatDossierNumber(prefix: string | null, counter: number): string {
  const trimmed = prefix?.trim() ?? '';
  return trimmed === '' ? String(counter) : `${trimmed} - ${counter}`;
}

/**
 * The project's dossier number, assigned on its first generation from the company's running
 * counter. A project that already has a number keeps it, so a regeneration (or a retry after a
 * failed job) never consumes a second number.
 *
 * Must run inside the transaction that queues the job. The project row is locked first, so two
 * concurrent first generations of the SAME project cannot both take a number; the counter itself
 * moves with one atomic `UPDATE … RETURNING`, so two different projects never get the same one.
 */
export async function assignDossierNumber(tx: Prisma.TransactionClient, companyId: string, projectId: string): Promise<string> {
  const [project] = await tx.$queryRaw<{ dossierNumber: string | null }[]>`
    SELECT "dossierNumber" FROM "project" WHERE "id" = ${projectId} AND "companyId" = ${companyId} FOR UPDATE`;
  if (!project) {
    throw new Error(`Project ${projectId} not found for company ${companyId}`);
  }
  if (project.dossierNumber !== null && project.dossierNumber.trim() !== '') {
    return project.dossierNumber;
  }

  const [counter] = await tx.$queryRaw<{ dossierPrefix: string | null; dossierCounter: number }[]>`
    UPDATE "company" SET "dossierCounter" = "dossierCounter" + 1 WHERE "id" = ${companyId}
    RETURNING "dossierPrefix", "dossierCounter"`;
  if (!counter) {
    throw new Error(`Company ${companyId} not found`);
  }
  const dossierNumber = formatDossierNumber(counter.dossierPrefix, counter.dossierCounter);
  await tx.project.update({ where: { id: projectId }, data: { dossierNumber } });
  return dossierNumber;
}
