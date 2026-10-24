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

/** Detail keys shown under a French name; the others keep their key. */
const DETAIL_LABELS: Record<string, string> = {
  email: 'email',
  fullName: 'nom',
  role: 'rôle',
  name: 'nom',
  planName: 'plan',
  ownerEmail: 'responsable',
  from: 'ancien',
  to: 'nouveau',
  sent: 'envoyé',
  amountTnd: 'montant (TND)',
  method: 'méthode',
  extendMonths: 'prolongation (mois)',
  periodEnd: 'fin de période',
  tier: 'niveau',
  monthlyDossierLimit: 'dossiers / mois',
  priceTnd: 'prix (TND)',
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;
const MAX_DETAILS_LENGTH = 200;

function describeValue(value: Prisma.JsonValue): string {
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (typeof value === 'string' && ISO_DATE.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' });
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * One line for an audit entry's details (`email : a@b.tn, envoyé : oui`). Ids (keys ending in
 * `Id`) and empty values are left out: the company is its own column and ids mean nothing to read.
 */
export function describeAuditDetails(details: Prisma.JsonValue | null): string {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    return '—';
  }
  const line = Object.entries(details)
    .filter(([key, value]) => value !== null && value !== undefined && value !== '' && !key.endsWith('Id'))
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key} : ${describeValue(value as Prisma.JsonValue)}`)
    .join(', ');
  if (line.length === 0) return '—';
  return line.length > MAX_DETAILS_LENGTH ? `${line.slice(0, MAX_DETAILS_LENGTH - 1)}…` : line;
}
