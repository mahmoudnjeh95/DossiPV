import { db } from '@dossipv/db';

const BATCH_SIZE = 100;

/**
 * Erases the screenshots of P2P payments once their retention (proofExpiresAt, one month after the
 * declaration) is over: proofImage and proofMime become null, proofExpiresAt stays as a trace. The
 * payment itself is untouched. Works in batches of ids so a large backlog never holds one huge
 * update. Returns how many screenshots were erased.
 */
export async function erasePaymentProofs(now: Date): Promise<number> {
  let erased = 0;
  for (;;) {
    const batch = await db.paymentIntent.findMany({
      where: { proofExpiresAt: { lte: now }, proofImage: { not: null } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    const result = await db.paymentIntent.updateMany({
      where: { id: { in: batch.map((intent) => intent.id) } },
      data: { proofImage: null, proofMime: null },
    });
    erased += result.count;
    if (batch.length < BATCH_SIZE) break;
  }
  return erased;
}
