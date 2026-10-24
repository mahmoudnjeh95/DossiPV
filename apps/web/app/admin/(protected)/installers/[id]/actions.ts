'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { FormReader } from '../../../../../lib/form-reader';
import { logAdminAction } from '../../../../../lib/admin-audit';
import { readLoginEmail, readNewPassword } from '../../../../../lib/account-form';
import { addMonths, extendedPeriodEnd } from '../../../../../lib/subscription';
import { audienceMismatchError } from '../../../../../lib/plan-audience';
import { isSponsored, unlinkInstaller } from '../../../../../lib/sponsorship';

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
  const subscription = await db.subscription.findUnique({ where: { companyId }, include: { plan: true } });
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
  // A company already on an archived plan keeps it; nobody else is moved onto one.
  if (plan.archivedAt && subscription?.planId !== planId) {
    return { error: "Ce plan est archivé : il n'est plus proposé." };
  }
  // Suppliers only receive packs, installers only installer plans.
  const company = await db.company.findUnique({ where: { id: companyId }, select: { kind: true } });
  if (!company) {
    return { error: 'Société introuvable.' };
  }
  const mismatch = audienceMismatchError(company.kind, plan.audience);
  if (mismatch) {
    return { error: mismatch };
  }

  // Spec 2026-10-23 §5.3: paying Premium itself ends a sponsored installer's sponsoring.
  const leavesSponsor = plan.tier === 'PREMIUM' && (await isSponsored(companyId));
  const sponsorDetails = leavesSponsor ? { leftSponsor: true } : {};

  if (subscription && subscription.plan?.isTrial && !plan.isTrial) {
    // Trial to paid plan: the trial subscription is replaced by a fresh period (the trial's
    // dossiers no longer count) and the audit entry keeps the trial plan it came from.
    const periodEndRaw = reader.text('periodEnd', 'Fin de période', 10);
    const newPeriodEnd = new Date(periodEndRaw);
    if (periodEndRaw.length === 0 || Number.isNaN(newPeriodEnd.getTime())) {
      return { error: "Fin de période : date valide requise pour passer de l'essai à un plan payant." };
    }
    await db.subscription.update({
      where: { companyId },
      data: { planId, status: 'ACTIVE', periodStart: new Date(), periodEnd: newPeriodEnd },
    });
    await logAdminAction(admin.id, 'subscription.changePlan', companyId, {
      planId,
      planName: plan.name,
      from: subscription.plan.name,
      periodEnd: newPeriodEnd.toISOString(),
      ...sponsorDetails,
    });
  } else if (subscription && leavesSponsor && subscription.status === 'SUSPENDED') {
    // The row only held the 3D option while the installer was sponsored (suspended, so it granted
    // nothing): it becomes the installer's own active plan, for the date given or one month.
    const requested = new Date(String(formData.get('periodEnd') ?? ''));
    const newPeriodEnd = Number.isNaN(requested.getTime()) ? addMonths(new Date(), 1) : requested;
    await db.subscription.update({ where: { companyId }, data: { planId, status: 'ACTIVE', periodStart: new Date(), periodEnd: newPeriodEnd } });
    await logAdminAction(admin.id, 'subscription.changePlan', companyId, { planId, planName: plan.name, periodEnd: newPeriodEnd.toISOString(), ...sponsorDetails });
  } else if (subscription) {
    await db.subscription.update({ where: { companyId }, data: { planId } });
    await logAdminAction(admin.id, 'subscription.changePlan', companyId, { planId, planName: plan.name, ...sponsorDetails });
  } else {
    await db.subscription.create({
      data: { companyId, planId, status: 'ACTIVE', periodStart: new Date(), periodEnd: periodEnd! },
    });
    await logAdminAction(admin.id, 'subscription.create', companyId, { planId, planName: plan.name, periodEnd: periodEnd!.toISOString(), ...sponsorDetails });
  }
  if (leavesSponsor) {
    await unlinkInstaller(companyId);
    await db.subscription.updateMany({ where: { companyId }, data: { option3dUntil: null } });
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

const OPTION_3D_MAX_MONTHS = 24;

/**
 * Sets or extends the 3D option (spec 2026-10-23 §2.1) of a SPONSORED installer: paid for `months`
 * more months, counted from the current end of the option while it still runs, from today otherwise.
 * A direct installer cannot buy it (it moves to Premium, which includes 3D).
 *
 * `option3dUntil` lives on Subscription, but a sponsored installer normally has no subscription of
 * its own (its Standard plan is paid by its supplier and read from the supplier's, see
 * loadEffectiveSubscription, which takes only `option3dUntil` from the installer's own row). When
 * the row must be created to hold the date, it is the Standard installer plan with status
 * SUSPENDED: a suspended row never grants generation, quota or 3D by itself, and the expiry
 * reminders skip suspended subscriptions. Its periodEnd is the option's end date.
 */
export async function extendOption3dAction(
  companyId: string,
  _prevState: InstallerActionState | undefined,
  formData: FormData,
): Promise<InstallerActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const months = reader.integer('months', 'Durée (mois)', { min: 1, max: OPTION_3D_MAX_MONTHS });
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { kind: true, sponsorCompanyId: true, subscription: { select: { option3dUntil: true } } },
  });
  if (!company || company.kind !== 'INSTALLER') {
    return { error: 'Installateur introuvable.' };
  }
  if (!company.sponsorCompanyId) {
    return { error: 'L’option 3D est réservée aux installateurs parrainés : un installateur direct passe au plan Premium, qui inclut la 3D.' };
  }

  const now = new Date();
  const option3dUntil = extendedPeriodEnd(company.subscription?.option3dUntil ?? now, now, months);
  if (company.subscription) {
    await db.subscription.update({ where: { companyId }, data: { option3dUntil } });
  } else {
    const standard = await db.plan.findFirst({
      where: { audience: 'INSTALLER', tier: 'STANDARD', isTrial: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!standard) {
      return { error: 'Aucun plan Standard installateur : créez-le dans Plans avant de vendre l’option 3D.' };
    }
    await db.subscription.create({
      data: { companyId, planId: standard.id, status: 'SUSPENDED', periodStart: now, periodEnd: option3dUntil, option3dUntil },
    });
  }
  await logAdminAction(admin.id, 'subscription.option3d', companyId, { months, option3dUntil: option3dUntil.toISOString() });
  redirect(`/admin/installers/${companyId}`);
}

/** Ends the 3D option now. The (suspended) subscription row that may hold it is left in place. */
export async function clearOption3dAction(companyId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  const result = await db.subscription.updateMany({ where: { companyId, option3dUntil: { not: null } }, data: { option3dUntil: null } });
  if (result.count > 0) {
    await logAdminAction(admin.id, 'subscription.option3d', companyId, { option3dUntil: null });
  }
  redirect(`/admin/installers/${companyId}`);
}
