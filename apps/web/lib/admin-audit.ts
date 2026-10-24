import { db, Prisma } from '@dossipv/db';

/**
 * Records one change made from /admin (spec 2026-10-23 §4: every admin mutation is logged). Call
 * it after the change succeeded, in the same server action. `action` is a short stable key such
 * as `company.create`, `user.disable`, `subscription.extend`, `plan.update`, `impersonation.start`;
 * `details` holds what changed (ids, old and new values), never a password or a token.
 */
export async function logAdminAction(entry: {
  superAdminId: string;
  action: string;
  targetCompanyId?: string | null;
  details?: Prisma.InputJsonObject;
}): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      superAdminId: entry.superAdminId,
      action: entry.action,
      targetCompanyId: entry.targetCompanyId ?? null,
      details: entry.details ?? {},
    },
  });
}
