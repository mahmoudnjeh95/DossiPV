'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { FormReader } from '../../../../lib/form-reader';
import { withNotice } from '../../../../lib/admin-notice';
import { logAdminAction } from '../../../../lib/admin-audit';

export interface PlanActionState {
  error: string;
}

const TIERS = ['STANDARD', 'PREMIUM'] as const;
const AUDIENCES = ['INSTALLER', 'SUPPLIER'] as const;

interface PlanData {
  name: string;
  tier: (typeof TIERS)[number];
  monthlyDossierLimit: number;
  priceTnd: number;
  isTrial: boolean;
  audience: (typeof AUDIENCES)[number];
  maxSponsoredInstallers: number | null;
  dossiersPerInstallerPerMonth: number;
  includesHighlight: boolean;
}

/**
 * An installer plan has a tier, a monthly limit and maybe the trial flag; a supplier pack has a
 * price, the tier its sponsored installers get, a number of installer accounts, a per-installer
 * monthly quota and the highlight flag. The fields that do not apply are stored neutral (limit 0
 * for a pack; no pack figures for an installer plan), whatever the form sent.
 */
function readPlan(formData: FormData): { error: string } | PlanData {
  const reader = new FormReader(formData);
  const audience = reader.optionalOneOf('audience', 'Public', AUDIENCES) ?? 'INSTALLER';
  const name = reader.text('name', 'Nom', 100);
  const priceTnd = reader.number('priceTnd', 'Prix (TND)', { min: 0, max: 100_000 });
  let plan: PlanData;
  if (audience === 'SUPPLIER') {
    plan = {
      name,
      tier: reader.optionalOneOf('tier', 'Niveau', TIERS) ?? 'STANDARD',
      monthlyDossierLimit: 0,
      priceTnd,
      isTrial: false,
      audience,
      maxSponsoredInstallers: reader.integer('maxSponsoredInstallers', 'Nombre de comptes installateurs', { min: 1, max: 10_000 }),
      dossiersPerInstallerPerMonth:
        reader.optionalInteger('dossiersPerInstallerPerMonth', 'Dossiers par installateur et par mois', { min: 1, max: 1000 }) ?? 5,
      includesHighlight: reader.boolean('includesHighlight'),
    };
  } else {
    plan = {
      name,
      tier: reader.oneOf('tier', 'Niveau', TIERS),
      monthlyDossierLimit: reader.integer('monthlyDossierLimit', 'Dossiers par mois', { min: 1, max: 1000 }),
      priceTnd,
      isTrial: reader.boolean('isTrial'),
      audience,
      maxSponsoredInstallers: null,
      dossiersPerInstallerPerMonth: 5,
      includesHighlight: false,
    };
  }
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
  redirect(withNotice('/admin/plans', 'planSaved'));
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

  // A plan keeps its audience once companies hold it: an installer plan never becomes a pack under them.
  const existing = await db.plan.findUnique({ where: { id: planId }, include: { _count: { select: { subscriptions: true } } } });
  if (existing && existing.audience !== plan.audience && existing._count.subscriptions > 0) {
    return { error: 'Ce plan a déjà des sociétés abonnées : son public ne peut plus changer.' };
  }

  await db.plan.update({ where: { id: planId }, data: plan });
  await logAdminAction(admin.id, 'plan.update', null, { planId, ...plan });
  redirect(withNotice('/admin/plans', 'planSaved'));
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
  redirect(withNotice('/admin/plans', 'planArchived'));
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
  redirect(withNotice('/admin/plans', 'planUnarchived'));
}
