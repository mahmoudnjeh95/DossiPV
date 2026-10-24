'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { FormReader } from '../../../../lib/form-reader';
import { logAdminAction } from '../../../../lib/admin-audit';

export interface PlanActionState {
  error: string;
}

const TIERS = ['STANDARD', 'PREMIUM'] as const;

function readPlan(
  formData: FormData,
): { error: string } | { name: string; tier: (typeof TIERS)[number]; monthlyDossierLimit: number; priceTnd: number; isTrial: boolean } {
  const reader = new FormReader(formData);
  const plan = {
    name: reader.text('name', 'Nom', 100),
    tier: reader.oneOf('tier', 'Niveau', TIERS),
    monthlyDossierLimit: reader.integer('monthlyDossierLimit', 'Dossiers par mois', { min: 1, max: 1000 }),
    priceTnd: reader.number('priceTnd', 'Prix (TND)', { min: 0, max: 100_000 }),
    isTrial: reader.boolean('isTrial'),
  };
  return reader.hasErrors ? { error: reader.errorMessage() } : plan;
}

const SECOND_TRIAL_ERROR = "Un plan d'essai gratuit existe déjà : archivez-le avant d'en créer un autre.";

/** True when another non-archived plan is already the free trial (at most one at a time). */
async function otherTrialExists(exceptPlanId: string | null): Promise<boolean> {
  const other = await db.plan.findFirst({
    where: { isTrial: true, archivedAt: null, ...(exceptPlanId ? { id: { not: exceptPlanId } } : {}) },
    select: { id: true },
  });
  return other !== null;
}

/**
 * Plans are edited in place: a subscribed company sees a new limit or price from its next
 * check, and the month's usage carries over (master spec §8).
 */
export async function createPlanAction(
  _prevState: PlanActionState | undefined,
  formData: FormData,
): Promise<PlanActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();
  const plan = readPlan(formData);
  if ('error' in plan) {
    return plan;
  }

  if (plan.isTrial && (await otherTrialExists(null))) {
    return { error: SECOND_TRIAL_ERROR };
  }

  const created = await db.plan.create({ data: plan });
  await logAdminAction(admin.id, 'plan.create', null, { planId: created.id, ...plan });
  redirect('/admin/plans');
}

export async function updatePlanAction(
  planId: string,
  _prevState: PlanActionState | undefined,
  formData: FormData,
): Promise<PlanActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();
  const plan = readPlan(formData);
  if ('error' in plan) {
    return plan;
  }

  if (plan.isTrial && (await otherTrialExists(planId))) {
    return { error: SECOND_TRIAL_ERROR };
  }

  await db.plan.update({ where: { id: planId }, data: plan });
  await logAdminAction(admin.id, 'plan.update', null, { planId, ...plan });
  redirect('/admin/plans');
}

/**
 * An archived plan is no longer offered for a new subscription or a plan change; companies
 * already on it keep it. Plans are never deleted, so past subscriptions and payments keep theirs.
 */
export async function archivePlanAction(planId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (plan && !plan.archivedAt) {
    await db.plan.update({ where: { id: planId }, data: { archivedAt: new Date() } });
    await logAdminAction(admin.id, 'plan.archive', null, { planId, name: plan.name });
  }
  redirect('/admin/plans');
}

export async function unarchivePlanAction(planId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (plan?.archivedAt) {
    // Bringing back a second trial plan would break the one-at-a-time rule.
    if (plan.isTrial && (await otherTrialExists(planId))) {
      redirect('/admin/plans');
      return;
    }
    await db.plan.update({ where: { id: planId }, data: { archivedAt: null } });
    await logAdminAction(admin.id, 'plan.unarchive', null, { planId, name: plan.name });
  }
  redirect('/admin/plans');
}
