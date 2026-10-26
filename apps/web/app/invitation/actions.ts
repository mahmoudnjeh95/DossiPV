'use server';

import { redirect } from 'next/navigation';
import { hashPassword } from '@dossipv/auth';
import { db } from '@dossipv/db';
import { adminEmailAddress } from '@dossipv/email';
import { FormReader } from '../../lib/form-reader';
import { readNewPassword } from '../../lib/account-form';
import { currentInstallerCompany } from '../../lib/installer-session';
import { LOCKED_KINDS, SponsorshipError, acceptInvitation, findValidInvitation, supplierSeats } from '../../lib/sponsorship';
import { ALL_EQUIPMENT_KINDS, addSharedCatalogToLibrary } from '../../lib/library-seed';

const INVALID_MESSAGE = 'Cette invitation n’est plus valide.';
const FULL_MESSAGE = 'Le pack de ce fournisseur est complet : demandez-lui de passer à un pack plus grand.';

/** Same placeholder as the self sign-up: the installer completes the ANME dates in Paramètres. */
const PLACEHOLDER_ANME_DATE = new Date('2000-01-01T00:00:00.000Z');
const ANME_CODE_PATTERN = /^[A-Z0-9 /-]+$/;

export type InvitationActionState = { error: string } | undefined;

/** A signed-in installer accepts the invitation: it becomes sponsored and uses the supplier's panels and inverters. */
export async function acceptInvitationAction(token: string): Promise<InvitationActionState> {
  const installer = await currentInstallerCompany();
  if (!installer) {
    return { error: 'Connectez-vous avec un compte installateur, puis rouvrez le lien de l’invitation.' };
  }
  try {
    await acceptInvitation(token, installer.companyId);
  } catch (error) {
    if (error instanceof SponsorshipError) return { error: error.message };
    throw error;
  }
  redirect('/dashboard');
}

/** An ANME code compared without case, spaces or dashes ("ab-12 3" is "AB123"). */
function anmeKey(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function anmeTakenMessage(): string {
  const admin = adminEmailAddress();
  return admin ? `Ce code ANME est déjà inscrit, contactez-nous (${admin}).` : 'Ce code ANME est déjà inscrit, contactez-nous.';
}

/**
 * Creates the account of a new installer from an invitation: the email is the invitation's (the
 * link proves it, so it is verified at once), the company is linked to the supplier and the
 * invitation used up. No trial: the installer generates under its supplier's subscription.
 */
export async function createAccountFromInvitationAction(
  token: string,
  _prevState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const invitation = await findValidInvitation(token);
  if (!invitation) return { error: INVALID_MESSAGE };

  const reader = new FormReader(formData);
  const companyName = reader.text('companyName', 'Raison sociale', 200);
  const contactName = reader.text('contactName', 'Nom et prénom du contact', 200);
  const phone = reader.text('phone', 'Téléphone', 30);
  const anmeCode = reader.text('anmeCode', 'Code ANME', 40).replace(/\s+/g, ' ').toUpperCase();
  if (anmeCode.length > 0 && (anmeCode.length < 3 || !ANME_CODE_PATTERN.test(anmeCode))) {
    reader.errors.push('Code ANME : 3 à 40 caractères (lettres, chiffres, espace, tiret ou barre oblique).');
  }
  const password = readNewPassword(reader, formData, 'password', 'Mot de passe');
  if (password.length > 0 && formData.get('confirmation') !== password) {
    reader.errors.push('Les deux mots de passe ne correspondent pas.');
  }
  const submittedEmail = formData.get('email');
  if (typeof submittedEmail === 'string' && submittedEmail.trim().toLowerCase() !== invitation.email) {
    reader.errors.push('L’adresse e-mail doit être celle de l’invitation.');
  }
  if (reader.hasErrors) return { error: reader.errorMessage() };

  const email = invitation.email;
  const existingUser = await db.companyUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (existingUser) {
    return { error: 'Un compte existe déjà pour cette adresse : connectez-vous, puis rouvrez le lien de l’invitation.' };
  }
  const registeredCodes = await db.company.findMany({ select: { anmeCode: true } });
  if (registeredCodes.some((company) => anmeKey(company.anmeCode) === anmeKey(anmeCode))) {
    return { error: anmeTakenMessage() };
  }
  const seats = await supplierSeats(invitation.supplierCompanyId);
  if (!seats.hasPack || (seats.max !== null && seats.used >= seats.max)) return { error: FULL_MESSAGE };

  const passwordHash = await hashPassword(password);
  const companyId = await db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: companyName,
        address: '',
        phone,
        email,
        legalRepFullName: contactName,
        anmeCode,
        anmeCategory: 'BT',
        anmeValidFrom: PLACEHOLDER_ANME_DATE,
        anmeValidTo: PLACEHOLDER_ANME_DATE,
        profileComplete: false,
        signupAt: new Date(),
        signupContactName: contactName,
        signupGovernorate: '',
        libraryHintPending: true,
      },
    });
    // The invitation email proves the address: no confirmation link to send.
    await tx.companyUser.create({
      data: { companyId: company.id, email, fullName: contactName, role: 'OWNER', passwordHash, emailVerifiedAt: new Date() },
    });
    return company.id;
  });

  try {
    await acceptInvitation(token, companyId);
  } catch (error) {
    // The seat or the invitation went in the meantime: leave nothing half done.
    await db.$transaction([db.companyUser.deleteMany({ where: { companyId } }), db.company.delete({ where: { id: companyId } })]);
    if (error instanceof SponsorshipError) return { error: error.message };
    throw error;
  }
  // Everything but the panels and inverters: those come from the supplier (linked above).
  await addSharedCatalogToLibrary(companyId, ALL_EQUIPMENT_KINDS.filter((kind) => !(LOCKED_KINDS as readonly string[]).includes(kind)));
  redirect('/login?compte=cree');
}
