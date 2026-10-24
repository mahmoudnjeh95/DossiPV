'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { SponsorshipError, linkInstaller, normalizeEmail } from '../../../lib/sponsorship';

export type SponsorshipActionState = { error: string } | undefined;

/** An installer accepts a pending invitation addressed to one of its users (the Paramètres block). */
export async function acceptPendingInvitationAction(invitationId: string): Promise<SponsorshipActionState> {
  const user = await requireAuthenticatedCompanyUser();
  const invitation = await db.supplierInvitation.findUnique({ where: { id: invitationId } });
  const addressedToUs = invitation !== null && normalizeEmail(invitation.email) === normalizeEmail(user.email);
  if (!invitation || !addressedToUs || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return { error: 'Cette invitation n’est plus valide.' };
  }
  try {
    await linkInstaller(user.companyId, invitation.supplierCompanyId);
  } catch (error) {
    if (error instanceof SponsorshipError) return { error: error.message };
    throw error;
  }
  const used = await db.supplierInvitation.updateMany({
    where: { id: invitation.id, acceptedAt: null },
    data: { acceptedAt: new Date(), acceptedCompanyId: user.companyId },
  });
  if (used.count !== 1) return { error: 'Cette invitation n’est plus valide.' };
  revalidatePath('/settings');
  return undefined;
}
