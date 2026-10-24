'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { FormReader } from '../../../../lib/form-reader';
import { logAdminAction } from '../../../../lib/admin-audit';
import { readLoginEmail, readNewPassword } from '../../../../lib/account-form';

export interface CreateInstallerActionState {
  error: string;
}

const ANME_CATEGORIES = ['BT', 'MT', 'BT_MT'] as const;

/**
 * Creates an installer company with its first login (OWNER) and, when a plan is chosen, its
 * subscription, in one write. The installer completes the rest of its company details in
 * Paramètres; the super-admin gives it the password directly.
 */
export async function createInstallerAction(
  _prevState: CreateInstallerActionState | undefined,
  formData: FormData,
): Promise<CreateInstallerActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const company = {
    name: reader.text('name', 'Raison sociale', 200),
    address: reader.text('address', 'Adresse', 300),
    phone: reader.text('phone', 'Téléphone', 30),
    email: reader.text('email', 'Email de contact', 200),
    legalRepFullName: reader.text('legalRepFullName', 'Représentant légal', 200),
    anmeCode: reader.text('anmeCode', 'Code ANME', 50),
    anmeCategory: reader.oneOf('anmeCategory', 'Catégorie ANME', ANME_CATEGORIES),
  };
  const anmeValidFrom = new Date(reader.text('anmeValidFrom', 'Début de validité ANME', 10));
  const anmeValidTo = new Date(reader.text('anmeValidTo', 'Fin de validité ANME', 10));
  const ownerFullName = reader.text('ownerFullName', 'Nom du responsable', 200);
  const ownerEmail = readLoginEmail(reader, 'ownerEmail', 'Email de connexion');
  const ownerPassword = readNewPassword(reader, formData, 'ownerPassword', 'Mot de passe');
  const planId = reader.optionalText('planId', 'Plan', 100);
  let periodEnd: Date | null = null;
  if (planId !== null) {
    const periodEndRaw = reader.text('periodEnd', 'Fin de période', 10);
    periodEnd = new Date(periodEndRaw);
    if (periodEndRaw.length > 0 && Number.isNaN(periodEnd.getTime())) {
      reader.errors.push('Fin de période : date invalide.');
    }
  }
  if (Number.isNaN(anmeValidFrom.getTime()) || Number.isNaN(anmeValidTo.getTime())) {
    reader.errors.push('Dates de validité ANME invalides.');
  } else if (anmeValidTo <= anmeValidFrom) {
    reader.errors.push('La fin de validité ANME doit être postérieure au début.');
  }
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  if (await db.companyUser.findUnique({ where: { email: ownerEmail } })) {
    return { error: 'Cet email de connexion est déjà utilisé par un autre compte.' };
  }
  const sameAnme = await db.company.findFirst({
    where: { anmeCode: { equals: company.anmeCode, mode: 'insensitive' } },
    select: { name: true },
  });
  if (sameAnme) {
    return { error: `Ce code ANME est déjà inscrit (${sameAnme.name}).` };
  }
  if (planId !== null && !(await db.plan.findUnique({ where: { id: planId } }))) {
    return { error: 'Plan introuvable.' };
  }

  const created = await db.company.create({
    data: {
      ...company,
      anmeValidFrom,
      anmeValidTo,
      users: {
        create: { email: ownerEmail, fullName: ownerFullName, role: 'OWNER', passwordHash: await hashPassword(ownerPassword) },
      },
      ...(planId !== null && periodEnd !== null
        ? { subscription: { create: { planId, status: 'ACTIVE', periodStart: new Date(), periodEnd } } }
        : {}),
    },
  });
  await logAdminAction(admin.id, 'company.create', created.id, {
    name: company.name,
    ownerEmail,
    planId,
    periodEnd: periodEnd?.toISOString() ?? null,
  });
  redirect(`/admin/installers/${created.id}`);
}
