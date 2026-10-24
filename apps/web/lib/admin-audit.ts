import { db, type Prisma } from '@dossipv/db';

/**
 * Records one super-admin change in AdminAuditLog. `details` holds the values the change wrote,
 * never a password or its hash.
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
