'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { appUrl, sendEmail } from '@dossipv/email';
import { requireSupplier } from '../../../lib/supplier-access';
import { FormReader } from '../../../lib/form-reader';
import { EMAIL_PATTERN } from '../../../lib/account-form';
import { createInvitation, SponsorshipError, unlinkInstaller } from '../../../lib/sponsorship';

export type InviteState = { error: string } | { sent: string } | undefined;

/** The supplier invites an installer by email: the pack's seats are checked by `createInvitation`. */
export async function inviteInstallerAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { supplierId, supplierName } = await requireSupplier();
  const reader = new FormReader(formData);
  const address = reader.text('email', 'Adresse e-mail', 200);
  if (reader.hasErrors || !EMAIL_PATTERN.test(address)) return { error: 'Saisissez une adresse e-mail valide.' };

  let invitation: { token: string; email: string };
  try {
    invitation = await createInvitation(supplierId, address);
  } catch (error) {
    if (error instanceof SponsorshipError) return { error: error.message };
    throw error;
  }

  await sendEmail({
    to: invitation.email,
    subject: `${supplierName} vous invite sur SolarixPro`,
    text:
      'Bonjour,\n\n' +
      `${supplierName} vous invite à utiliser SolarixPro : votre abonnement Standard est offert par ce fournisseur. ` +
      'En acceptant, vous ne pourrez utiliser que les panneaux et onduleurs référencés par ce fournisseur. ' +
      'Le lien est valable 7 jours.\n\n' +
      'Si vous ne connaissez pas ce fournisseur, ignorez cet email.',
    action: { label: 'Accepter l’invitation', url: appUrl(`/invitation?token=${encodeURIComponent(invitation.token)}`) },
  });

  revalidatePath('/fournisseur/installateurs');
  return { sent: invitation.email };
}

export type SupplierInstallerActionState = { error: string } | undefined;

/** The supplier removes a sponsored installer: it becomes a direct installer (and pays its own plan). */
export async function removeSponsoredInstallerAction(installerId: string): Promise<SupplierInstallerActionState> {
  const { supplierId } = await requireSupplier();
  const installer = await db.company.findFirst({ where: { id: installerId, sponsorCompanyId: supplierId }, select: { id: true } });
  if (!installer) return { error: 'Installateur introuvable.' };
  await unlinkInstaller(installer.id);
  revalidatePath('/fournisseur/installateurs');
  return undefined;
}

/** Cancels a pending invitation (the link stops working). */
export async function cancelInvitationAction(invitationId: string): Promise<SupplierInstallerActionState> {
  const { supplierId } = await requireSupplier();
  await db.supplierInvitation.deleteMany({ where: { id: invitationId, supplierCompanyId: supplierId, acceptedAt: null } });
  revalidatePath('/fournisseur/installateurs');
  return undefined;
}
