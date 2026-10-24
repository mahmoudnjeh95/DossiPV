'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { FormReader } from '../../../../../lib/form-reader';
import { logAdminAction } from '../../../../../lib/admin-audit';
import { readLoginEmail, readNewPassword } from '../../../../../lib/account-form';
import { parseFuturePeriodEnd } from '../../../../../lib/admin-period';
import { withNotice } from '../../../../../lib/admin-notice';
import { addMonths } from '../../../../../lib/subscription';
import { extendOption3dUntil, periodExtensionData } from '../../../../../lib/subscription-extension';
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
  redirect(withNotice(`/admin/installers/${companyId}`, 'subscriptionSuspended'));
}

export async function activateSubscriptionAction(companyId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  await db.subscription.update({ where: { companyId }, data: { status: 'ACTIVE' } });
  await logAdminAction(admin.id, 'subscription.activate', companyId);
  redirect(withNotice(`/admin/installers/${companyId}`, 'subscriptionActivated'));
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

  if (typeof amountField !== 'string' || amountField.trim().length === 0) {
    return { error: 'Montant (TND) : saisissez le montant payé.' };
  }
  if (typeof methodField !== 'string') {
    return { error: 'Méthode : choisissez une méthode de paiement.' };
  }

  const amountTnd = Number(amountField);
  if (!Number.isFinite(amountTnd)) {
    return { error: 'Montant (TND) : nombre invalide.' };
  }
  if (amountTnd <= 0) {
    return { error: 'Montant (TND) : le montant doit être supérieur à 0.' };
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
      const extension = periodExtensionData(subscription, new Date(), extendMonths, 'expired');
      periodEnd = extension.periodEnd;
      await db.subscription.update({ where: { companyId }, data: extension });
    }
  }
  await logAdminAction(admin.id, 'payment.record', companyId, {
    amountTnd,
    method,
    note,
    extendMonths,
    periodEnd: periodEnd?.toISOString() ?? null,
  });

  redirect(withNotice(`/admin/installers/${companyId}`, 'paymentRecorded'));
}

/** Sets the end of the period to the date typed. A date in the past is refused: it would expire the subscription at once. */
export async function updatePeriodEndAction(
  companyId: string,
  _prevState: InstallerActionState | undefined,
  formData: FormData,
): Promise<InstallerActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const periodEndField = String((formData.get('periodEnd') as string | null) ?? '');
  const parsed = parseFuturePeriodEnd(periodEndField, new Date());
  if ('error' in parsed) {
    return { error: parsed.error };
  }

  await db.subscription.update({ where: { companyId }, data: { periodEnd: parsed.date } });
  await logAdminAction(admin.id, 'subscription.periodEnd', companyId, { periodEnd: periodEndField });
  redirect(withNotice(`/admin/installers/${companyId}`, 'periodEndUpdated'));
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
    const parsed = parseFuturePeriodEnd(String((formData.get('periodEnd') as string | null) ?? ''), new Date());
    if ('error' in parsed) {
      reader.errors.push(parsed.error);
    } else {
      periodEnd = parsed.date;
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
  // The free trial is granted by the sign-up; by hand it is only kept, never chosen (it does not sell).
  if (plan.isTrial && subscription?.planId !== planId) {
    return { error: "L'essai gratuit est attribué à l'inscription : il ne se choisit pas à la main." };
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
    const parsedEnd = parseFuturePeriodEnd(String((formData.get('periodEnd') as string | null) ?? ''), new Date());
    if ('error' in parsedEnd) {
      return { error: `${parsedEnd.error} (obligatoire pour passer de l'essai à un plan payant)` };
    }
    const newPeriodEnd = parsedEnd.date;
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
    const rawEnd = typeof formData.get('periodEnd') === 'string' ? (formData.get('periodEnd') as string) : '';
    let newPeriodEnd = addMonths(new Date(), 1);
    if (rawEnd.trim().length > 0) {
      const requested = parseFuturePeriodEnd(rawEnd, new Date());
      if ('error' in requested) {
        return { error: requested.error };
      }
      newPeriodEnd = requested.date;
    }
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
  redirect(withNotice(`/admin/installers/${companyId}`, subscription ? 'planChanged' : 'subscriptionCreated'));
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
  redirect(withNotice(`/admin/installers/${companyId}`, 'userAdded'));
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
  redirect(withNotice(`/admin/installers/${companyId}`, 'passwordReset'));
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

  let option3dUntil: Date;
  try {
    option3dUntil = await extendOption3dUntil(db, companyId, months, new Date(), company.subscription?.option3dUntil, company.subscription !== null);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Impossible d’enregistrer l’option 3D.' };
  }
  await logAdminAction(admin.id, 'subscription.option3d', companyId, { months, option3dUntil: option3dUntil.toISOString() });
  redirect(withNotice(`/admin/installers/${companyId}`, 'option3dSaved'));
}

/** Ends the 3D option now. The (suspended) subscription row that may hold it is left in place. */
export async function clearOption3dAction(companyId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  const result = await db.subscription.updateMany({ where: { companyId, option3dUntil: { not: null } }, data: { option3dUntil: null } });
  if (result.count > 0) {
    await logAdminAction(admin.id, 'subscription.option3d', companyId, { option3dUntil: null });
  }
  redirect(withNotice(`/admin/installers/${companyId}`, 'option3dCleared'));
}
