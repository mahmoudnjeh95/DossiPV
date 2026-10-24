'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { FormReader } from '../../../../../lib/form-reader';
import { logAdminAction } from '../../../../../lib/admin-audit';
import { readLoginEmail, readNewPassword } from '../../../../../lib/account-form';
import { extendedPeriodEnd } from '../../../../../lib/subscription';

export interface RecordPaymentActionState {
  error: string;
}

export interface InstallerActionState {
  error: string;
}

const PAYMENT_METHODS = ['MANUAL', 'KONNECT'] as const;
const USER_ROLES = ['OWNER', 'MEMBER'] as const;

export async function suspendSubscriptionAction(companyId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  await db.subscription.update({ where: { companyId }, data: { status: 'SUSPENDED' } });
  await logAdminAction(admin.id, 'subscription.suspend', companyId);
  redirect(`/admin/installers/${companyId}`);
}

export async function activateSubscriptionAction(companyId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  await db.subscription.update({ where: { companyId }, data: { status: 'ACTIVE' } });
  await logAdminAction(admin.id, 'subscription.activate', companyId);
  redirect(`/admin/installers/${companyId}`);
}

/**
 * Records a payment and, when it covers months (`extendMonths`, 0 for none), moves the
 * subscription's end by that many months so payments and periodEnd cannot drift apart. An expired
 * subscription becomes active again; a suspended one stays suspended until reactivated.
 */
export async function recordPaymentAction(
  companyId: string,
  _prevState: RecordPaymentActionState | undefined,
  formData: FormData,
): Promise<RecordPaymentActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const amountField = formData.get('amountTnd');
  const methodField = formData.get('method');
  const noteField = formData.get('note');

  if (typeof amountField !== 'string' || typeof methodField !== 'string') {
    return { error: 'Montant invalide.' };
  }

  const amountTnd = Number(amountField);
  if (!Number.isFinite(amountTnd) || amountTnd <= 0) {
    return { error: 'Montant invalide.' };
  }

  const reader = new FormReader(formData);
  const method = reader.oneOf('method', 'Méthode', PAYMENT_METHODS);
  const extendMonths = reader.optionalInteger('extendMonths', "Prolongation de l'abonnement", { min: 0, max: 24 }) ?? 0;
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }
  const note = typeof noteField === 'string' && noteField.length > 0 ? noteField : null;

  await db.payment.create({
    data: { companyId, amountTnd, method, note, recordedByAdmin: true },
  });

  let periodEnd: Date | null = null;
  if (extendMonths > 0) {
    const subscription = await db.subscription.findUnique({ where: { companyId } });
    if (subscription) {
      periodEnd = extendedPeriodEnd(subscription.periodEnd, new Date(), extendMonths);
      await db.subscription.update({
        where: { companyId },
        data: { periodEnd, ...(subscription.status === 'EXPIRED' ? { status: 'ACTIVE' as const } : {}) },
      });
    }
  }
  await logAdminAction(admin.id, 'payment.record', companyId, {
    amountTnd,
    method,
    note,
    extendMonths,
    periodEnd: periodEnd?.toISOString() ?? null,
  });

  redirect(`/admin/installers/${companyId}`);
}

export async function updatePeriodEndAction(companyId: string, formData: FormData): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();

  const periodEndField = formData.get('periodEnd');

  if (typeof periodEndField !== 'string') {
    redirect(`/admin/installers/${companyId}`);
    return;
  }

  await db.subscription.update({ where: { companyId }, data: { periodEnd: new Date(periodEndField) } });
  await logAdminAction(admin.id, 'subscription.periodEnd', companyId, { periodEnd: periodEndField });
  redirect(`/admin/installers/${companyId}`);
}

/**
 * Gives the company a plan: changes the plan of its subscription (the end date and the month's
 * usage stay), or creates the subscription with the end date typed when it has none. Projects
 * already created keep their tier (spec §1: the tier is fixed when the project is created).
 */
export async function assignPlanAction(
  companyId: string,
  _prevState: InstallerActionState | undefined,
  formData: FormData,
): Promise<InstallerActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const planId = reader.text('planId', 'Plan', 100);
  const subscription = await db.subscription.findUnique({ where: { companyId } });
  let periodEnd: Date | null = null;
  if (!subscription) {
    const periodEndRaw = reader.text('periodEnd', 'Fin de période', 10);
    periodEnd = new Date(periodEndRaw);
    if (periodEndRaw.length > 0 && Number.isNaN(periodEnd.getTime())) {
      reader.errors.push('Fin de période : date invalide.');
    }
  }
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    return { error: 'Plan introuvable.' };
  }

  if (subscription) {
    await db.subscription.update({ where: { companyId }, data: { planId } });
    await logAdminAction(admin.id, 'subscription.changePlan', companyId, { planId, planName: plan.name });
  } else {
    await db.subscription.create({
      data: { companyId, planId, status: 'ACTIVE', periodStart: new Date(), periodEnd: periodEnd! },
    });
    await logAdminAction(admin.id, 'subscription.create', companyId, { planId, planName: plan.name, periodEnd: periodEnd!.toISOString() });
  }
  redirect(`/admin/installers/${companyId}`);
}

/** Adds a login to the company. The super-admin gives the password to the person directly. */
export async function addCompanyUserAction(
  companyId: string,
  _prevState: InstallerActionState | undefined,
  formData: FormData,
): Promise<InstallerActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const fullName = reader.text('fullName', 'Nom complet', 200);
  const email = readLoginEmail(reader, 'email', 'Email de connexion');
  const password = readNewPassword(reader, formData, 'password', 'Mot de passe');
  const role = reader.oneOf('role', 'Rôle', USER_ROLES);
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  if (await db.companyUser.findUnique({ where: { email } })) {
    return { error: 'Cet email est déjà utilisé par un autre compte.' };
  }

  await db.companyUser.create({
    data: { companyId, email, fullName, role, passwordHash: await hashPassword(password) },
  });
  await logAdminAction(admin.id, 'user.create', companyId, { email, fullName, role });
  redirect(`/admin/installers/${companyId}`);
}

/** Sets a new password for one of the company's users and ends every session it has open. */
export async function resetCompanyUserPasswordAction(
  companyId: string,
  userId: string,
  _prevState: InstallerActionState | undefined,
  formData: FormData,
): Promise<InstallerActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const password = readNewPassword(reader, formData, 'password', 'Nouveau mot de passe');
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  // Scoped to the company in the URL, so a user id from another company is never touched.
  const user = await db.companyUser.findFirst({ where: { id: userId, companyId } });
  if (!user) {
    return { error: 'Utilisateur introuvable.' };
  }

  await db.companyUser.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { companyUserId: userId } });
  await logAdminAction(admin.id, 'user.resetPassword', companyId, { email: user.email });
  redirect(`/admin/installers/${companyId}`);
}
