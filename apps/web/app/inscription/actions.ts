'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { createEmailVerificationToken, hashPassword, RateLimiter } from '@dossipv/auth';
import { db } from '@dossipv/db';
import { adminEmailAddress, appUrl, sendEmail } from '@dossipv/email';
import { FormReader } from '../../lib/form-reader';
import { readLoginEmail, readNewPassword } from '../../lib/account-form';
import { GOVERNORATES } from './governorates';

const HOUR_MS = 60 * 60 * 1000;
// RateLimiter locks on the Nth recorded hit, so N = allowed + 1: 5 requests per client and per
// address in any hour. Every request counts, so a lock says nothing about existing accounts.
const signUpPerClientLimiter = new RateLimiter(5 + 1, HOUR_MS);
const signUpPerEmailLimiter = new RateLimiter(5 + 1, HOUR_MS);
const resendPerClientLimiter = new RateLimiter(5 + 1, HOUR_MS);
const resendPerEmailLimiter = new RateLimiter(5 + 1, HOUR_MS);

/** Placeholder for the ANME validity dates a sign-up cannot know: the installer completes them in
 *  Paramètres (the company stays `profileComplete = false` until then). */
const PLACEHOLDER_ANME_DATE = new Date('2000-01-01T00:00:00.000Z');
const ANME_CODE_PATTERN = /^[A-Z0-9 /-]+$/;

export type SignUpFields = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  governorate: string;
  anmeCode: string;
};

export type SignUpState = { sent: true; email: string } | { sent: false; error: string; fields: SignUpFields };

export type ResendState = { sent: true; message: string } | { sent: false; error: string };

/** Same answer whether or not the account exists or is already verified. */
const RESEND_CONFIRMATION =
  "Si un compte en attente de confirmation existe pour cette adresse, un nouvel email vient d'être envoyé. Pensez à vérifier vos courriers indésirables.";

/** The client address as nginx saw it (X-Real-IP is overwritten by nginx, a client cannot spoof it). */
async function clientKey(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get('x-real-ip')?.trim() || 'unknown';
}

/** An ANME code compared without case, spaces or dashes ("ab-12 3" is "AB123"). */
function anmeKey(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function anmeTakenMessage(): string {
  const admin = adminEmailAddress();
  return admin ? `Ce code ANME est déjà inscrit, contactez-nous (${admin}).` : 'Ce code ANME est déjà inscrit, contactez-nous.';
}

export async function signUpAction(_prevState: SignUpState | undefined, formData: FormData): Promise<SignUpState> {
  const reader = new FormReader(formData);
  const companyName = reader.text('companyName', 'Raison sociale', 200);
  const contactName = reader.text('contactName', 'Nom et prénom', 200);
  const phone = reader.text('phone', 'Téléphone', 30);
  const email = readLoginEmail(reader, 'email', 'Adresse e-mail');
  const governorate = reader.text('governorate', 'Gouvernorat', 50);
  if (governorate.length > 0 && !(GOVERNORATES as readonly string[]).includes(governorate)) {
    reader.errors.push('Gouvernorat : choisissez dans la liste.');
  }
  const anmeCode = reader.text('anmeCode', 'Code ANME', 40).replace(/\s+/g, ' ').toUpperCase();
  if (anmeCode.length > 0 && (anmeCode.length < 3 || !ANME_CODE_PATTERN.test(anmeCode))) {
    reader.errors.push('Code ANME : 3 à 40 caractères (lettres, chiffres, espace, tiret ou barre oblique).');
  }
  const password = readNewPassword(reader, formData, 'password', 'Mot de passe');
  if (password.length > 0 && formData.get('confirmation') !== password) {
    reader.errors.push('Les deux mots de passe ne correspondent pas.');
  }
  const fields: SignUpFields = { companyName, contactName, phone, email, governorate, anmeCode };
  if (reader.hasErrors) {
    return { sent: false, error: reader.errorMessage(), fields };
  }

  // Counted before any lookup, so being limited says nothing about existing accounts.
  const clientLimited = signUpPerClientLimiter.recordFailure(await clientKey());
  const emailLimited = signUpPerEmailLimiter.recordFailure(email);
  if (clientLimited || emailLimited) {
    return { sent: false, error: 'Trop de demandes. Réessayez dans une heure.', fields };
  }

  // An address already in use gets the same confirmation page as a new one, so sign-up cannot be
  // used to find out who is an installer; the owner of the address is told by email instead.
  const confirmation: SignUpState = { sent: true, email };
  const existingUser = await db.companyUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (existingUser) {
    after(() => sendAccountExistsEmail(email));
    return confirmation;
  }

  // Codes are compared ignoring case, spaces and dashes, whatever format the admin stored.
  const registeredCodes = await db.company.findMany({ select: { anmeCode: true } });
  if (registeredCodes.some((company) => anmeKey(company.anmeCode) === anmeKey(anmeCode))) {
    return { sent: false, error: anmeTakenMessage(), fields };
  }

  const passwordHash = await hashPassword(password);
  let ownerId: string;
  try {
    ownerId = await db.$transaction(async (tx) => {
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
          signupGovernorate: governorate,
        },
      });
      const owner = await tx.companyUser.create({
        data: { companyId: company.id, email, fullName: contactName, role: 'OWNER', passwordHash },
      });
      return owner.id;
    });
  } catch (error) {
    // Two sign-ups racing on the same address: the loser gets the neutral answer too.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      return confirmation;
    }
    throw error;
  }

  after(() => sendVerificationEmail(ownerId, email, contactName));
  return confirmation;
}

async function sendVerificationEmail(companyUserId: string, to: string, contactName: string): Promise<void> {
  const token = await createEmailVerificationToken(companyUserId);
  await sendEmail({
    to,
    subject: 'Confirmez votre adresse e-mail DossiPV',
    text:
      `Bonjour ${contactName},\n\n` +
      'Merci de votre inscription à DossiPV. Confirmez votre adresse e-mail avec le lien ci-dessous pour activer votre essai gratuit : ' +
      '3 dossiers pendant 30 jours. Le lien est valable 48 heures.\n\n' +
      'Si vous n’êtes pas à l’origine de cette inscription, ignorez cet email.',
    action: { label: 'Confirmer mon adresse e-mail', url: appUrl(`/verifier-email?token=${encodeURIComponent(token)}`) },
  });
}

async function sendAccountExistsEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Un compte DossiPV existe déjà pour cette adresse',
    text:
      'Bonjour,\n\n' +
      'Quelqu’un vient de demander la création d’un compte DossiPV avec cette adresse, mais un compte existe déjà : ' +
      'connectez-vous, ou réinitialisez votre mot de passe si vous l’avez oublié.\n\n' +
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.',
    action: { label: 'Me connecter', url: appUrl('/login') },
  });
}

/** Sends a new confirmation link to a self sign-up that has not confirmed its address yet. */
export async function resendVerificationAction(_prevState: ResendState | undefined, formData: FormData): Promise<ResendState> {
  const emailField = formData.get('email');
  const email = typeof emailField === 'string' ? emailField.trim().toLowerCase() : '';
  if (email.length === 0 || email.length > 200) {
    return { sent: false, error: 'Saisissez votre adresse e-mail.' };
  }

  const clientLimited = resendPerClientLimiter.recordFailure(await clientKey());
  const emailLimited = resendPerEmailLimiter.recordFailure(email);
  if (clientLimited || emailLimited) {
    return { sent: false, error: 'Trop de demandes. Réessayez dans une heure.' };
  }

  const user = await db.companyUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, emailVerifiedAt: null, disabledAt: null, company: { signupAt: { not: null } } },
    select: { id: true, email: true, fullName: true },
  });
  if (user) {
    after(() => sendVerificationEmail(user.id, user.email, user.fullName));
  }
  return { sent: true, message: RESEND_CONFIRMATION };
}
