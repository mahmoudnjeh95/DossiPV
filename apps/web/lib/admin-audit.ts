import { db, type Prisma } from '@dossipv/db';

/**
 * Records one super-admin change in AdminAuditLog (spec 2026-10-23 §4: every admin mutation is
 * logged). Call it after the change succeeded, in the same server action. `action` is a short
 * stable key such as `plan.update`, `subscription.suspend`, `user.disable`, `impersonation.start`;
 * `details` holds the values the change wrote, never a password, its hash or a token.
 */
export async function logAdminAction(
  superAdminId: string,
  action: string,
  targetCompanyId: string | null,
  details?: Prisma.InputJsonObject,
): Promise<void> {
  await db.adminAuditLog.create({
    data: { superAdminId, action, targetCompanyId, ...(details !== undefined ? { details } : {}) },
  });
}
