'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, type CompanyUser } from '@dossipv/db';
import { ACCOUNT_SETUP_LIFETIME_MS, IMPERSONATION_LIFETIME_MS, createImpersonationSession, createPasswordResetToken } from '@dossipv/auth';
import { appUrl, isEmailConfigured, sendEmail } from '@dossipv/email';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { FormReader } from '../../../../../lib/form-reader';
import { logAdminAction } from '../../../../../lib/admin-audit';
import { readLoginEmail } from '../../../../../lib/account-form';
import { shouldUseSecureCookie } from '../../../../../lib/cookie-secure';

/** `error` when the action was refused; `notice` for a result to show without leaving the page. */
export interface UserActionState {
  error?: string;
  notice?: string;
}

const SESSION_COOKIE_NAME = 'dossipv_session';
const IMPERSONATION_MAX_AGE_SECONDS = IMPERSONATION_LIFETIME_MS / 1000;

/** The user, only when it belongs to the company in the URL: an id from another company is never touched. */
function findCompanyUser(companyId: string, userId: string): Promise<CompanyUser | null> {
  return db.companyUser.findFirst({ where: { id: userId, companyId } });
}

/**
 * Disables a login: it can no longer sign in and every session it has open ends now. The last
 * enabled OWNER of a company is never disabled, so the company always keeps someone in charge.
 */
export async function disableCompanyUserAction(
  companyId: string,
  userId: string,
): Promise<UserActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const user = await findCompanyUser(companyId, userId);
  if (!user) {
    return { error: 'Utilisateur introuvable.' };
  }
  if (user.disabledAt) {
    redirect(`/admin/installers/${companyId}`);
    return undefined;
  }
  if (user.role === 'OWNER') {
    const enabledOwners = await db.companyUser.count({ where: { companyId, role: 'OWNER', disabledAt: null } });
    if (enabledOwners <= 1) {
      return { error: 'Impossible de désactiver le dernier responsable actif de la société.' };
    }
  }

  await db.companyUser.update({ where: { id: userId }, data: { disabledAt: new Date() } });
  await db.session.deleteMany({ where: { companyUserId: userId } });
  await logAdminAction(admin.id, 'user.disable', companyId, { userId, email: user.email });
  redirect(`/admin/installers/${companyId}`);
}

export async function enableCompanyUserAction(
  companyId: string,
  userId: string,
): Promise<UserActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const user = await findCompanyUser(companyId, userId);
  if (!user) {
    return { error: 'Utilisateur introuvable.' };
  }
  if (user.disabledAt) {
    await db.companyUser.update({ where: { id: userId }, data: { disabledAt: null } });
    await logAdminAction(admin.id, 'user.enable', companyId, { userId, email: user.email });
  }
  redirect(`/admin/installers/${companyId}`);
}

/** Changes the address the user signs in with. Its password and open sessions stay. */
export async function changeCompanyUserEmailAction(
  companyId: string,
  userId: string,
  _prevState: UserActionState | undefined,
  formData: FormData,
): Promise<UserActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const email = readLoginEmail(reader, 'email', 'Email de connexion');
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const user = await findCompanyUser(companyId, userId);
  if (!user) {
    return { error: 'Utilisateur introuvable.' };
  }
  if (user.email === email) {
    redirect(`/admin/installers/${companyId}`);
    return undefined;
  }
  const taken = await db.companyUser.findUnique({ where: { email } });
  if (taken && taken.id !== userId) {
    return { error: 'Cet email est déjà utilisé par un autre compte.' };
  }

  await db.companyUser.update({ where: { id: userId }, data: { email } });
  await logAdminAction(admin.id, 'user.changeEmail', companyId, { userId, from: user.email, to: email });
  redirect(`/admin/installers/${companyId}`);
}

/**
 * Emails the user a one-time link to choose a password (valid ACCOUNT_SETUP_LIFETIME_MS), for a
 * new account or a forgotten password. Stays on the page and says whether the email really left:
 * without SMTP the email, link included, is only written to the server log.
 */
export async function sendCompanyUserResetLinkAction(
  companyId: string,
  userId: string,
): Promise<UserActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const user = await findCompanyUser(companyId, userId);
  if (!user) {
    return { error: 'Utilisateur introuvable.' };
  }
  if (user.disabledAt) {
    return { error: 'Cet utilisateur est désactivé : réactivez-le avant de lui envoyer un lien.' };
  }

  const token = await createPasswordResetToken(user.id, ACCOUNT_SETUP_LIFETIME_MS);
  const result = await sendEmail({
    to: user.email,
    subject: 'DossiPV : choisissez votre mot de passe',
    text: [
      `Bonjour ${user.fullName},`,
      `L'équipe DossiPV vous envoie un lien pour choisir le mot de passe de votre compte ${user.email}.`,
      "Ce lien est valable 7 jours et ne sert qu'une fois. Si vous n'attendiez pas ce message, ignorez-le : votre mot de passe actuel reste valable.",
    ].join('\n\n'),
    action: { label: 'Choisir mon mot de passe', url: appUrl(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`) },
  });
  await logAdminAction(admin.id, 'user.sendResetLink', companyId, { userId, email: user.email, sent: result.sent });
  revalidatePath(`/admin/installers/${companyId}`);

  if (result.sent) {
    return { notice: `Lien envoyé à ${user.email}.` };
  }
  if (!isEmailConfigured()) {
    return { error: "Email non envoyé : l'envoi d'emails (SMTP) n'est pas configuré sur le serveur. Le lien a été écrit dans le journal du serveur." };
  }
  return { error: `Email non envoyé : ${result.reason ?? "échec de l'envoi"}.` };
}

/**
 * "Se connecter en tant que" (spec §4): opens a one-hour support session as this user in the
 * installer app, in this browser. The app shows a banner for the whole session; ending it from
 * the banner comes back to this page.
 */
export async function impersonateCompanyUserAction(
  companyId: string,
  userId: string,
): Promise<UserActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const user = await findCompanyUser(companyId, userId);
  if (!user) {
    return { error: 'Utilisateur introuvable.' };
  }
  if (user.disabledAt) {
    return { error: 'Cet utilisateur est désactivé.' };
  }

  const token = await createImpersonationSession(admin.id, user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: await shouldUseSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
  });
  await logAdminAction(admin.id, 'impersonation.start', companyId, { userId, email: user.email });
  redirect('/dashboard');
}
