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

function readPlan(formData: FormData): { error: string } | { name: string; tier: (typeof TIERS)[number]; monthlyDossierLimit: number; priceTnd: number } {
  const reader = new FormReader(formData);
  const plan = {
    name: reader.text('name', 'Nom', 100),
    tier: reader.oneOf('tier', 'Niveau', TIERS),
    monthlyDossierLimit: reader.integer('monthlyDossierLimit', 'Dossiers par mois', { min: 1, max: 1000 }),
    priceTnd: reader.number('priceTnd', 'Prix (TND)', { min: 0, max: 100_000 }),
  };
  return reader.hasErrors ? { error: reader.errorMessage() } : plan;
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

  await db.plan.update({ where: { id: planId }, data: plan });
  await logAdminAction(admin.id, 'plan.update', null, { planId, ...plan });
  redirect('/admin/plans');
}
