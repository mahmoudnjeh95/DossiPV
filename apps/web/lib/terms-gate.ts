import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import type { AuthenticatedCompanyUser } from '@dossipv/auth';
import { needsTermsAcceptance } from './legal';

/**
 * Sends a user who has not accepted the current CGU and privacy policy to /conditions. Users the
 * admin created, invited users and accounts older than the terms meet it at their next visit. The
 * super admin impersonating a user is let through: it must not accept on the user's behalf.
 */
export async function requireCurrentTerms(user: AuthenticatedCompanyUser): Promise<void> {
  if (user.impersonatedBySuperAdminId) return;
  const row = await db.companyUser.findUnique({ where: { id: user.id }, select: { termsVersion: true } });
  if (needsTermsAcceptance(row?.termsVersion)) {
    redirect('/conditions');
  }
}
