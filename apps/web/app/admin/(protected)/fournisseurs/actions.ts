'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { FormReader } from '../../../../lib/form-reader';
import { logAdminAction } from '../../../../lib/admin-audit';
import { readLoginEmail, readNewPassword } from '../../../../lib/account-form';
import { parseFuturePeriodEnd } from '../../../../lib/admin-period';
import { withNotice } from '../../../../lib/admin-notice';
import { audienceMismatchError } from '../../../../lib/plan-audience';

export interface CreateSupplierActionState {
  error: string;
}

/** Same placeholder date the sign-up flow stores for the ANME validity a supplier does not have. */
const PLACEHOLDER_ANME_DATE = new Date('2000-01-01');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** `FOURNISSEUR-K7Q2XM`: the legacy NOT NULL ANME column needs a value, and this one is easy to tell apart from a real code. */
function placeholderAnmeCode(): string {
  const bytes = randomBytes(6);
  return `FOURNISSEUR-${Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')}`;
}

/**
 * Creates a supplier (fournisseur) company with its first login (OWNER) and, when a pack is
 * chosen, its subscription, in one write. A supplier has no address, legal representative or ANME
 * accreditation: the legacy required columns hold placeholders, like a self sign-up's.
 */
export async function createSupplierAction(
  _prevState: CreateSupplierActionState | undefined,
  formData: FormData,
): Promise<CreateSupplierActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const name = reader.text('name', 'Raison sociale', 200);
  const contactName = reader.text('contactName', 'Nom du contact', 200);
  const email = reader.text('email', 'Email de contact', 200);
  const phone = reader.text('phone', 'Téléphone', 30);
  const ownerEmail = readLoginEmail(reader, 'ownerEmail', 'Email de connexion');
  const ownerPassword = readNewPassword(reader, formData, 'ownerPassword', 'Mot de passe');
  const planId = reader.optionalText('planId', 'Pack', 100);
  let periodEnd: Date | null = null;
  if (planId !== null) {
    const parsed = parseFuturePeriodEnd(String((formData.get('periodEnd') as string | null) ?? ''), new Date());
    if ('error' in parsed) {
      reader.errors.push(`${parsed.error.replace(/\.$/, '')} (obligatoire quand un pack est choisi).`);
    } else {
      periodEnd = parsed.date;
    }
  }
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  if (await db.companyUser.findUnique({ where: { email: ownerEmail } })) {
    return { error: 'Cet email de connexion est déjà utilisé par un autre compte.' };
  }
  if (planId !== null) {
    const plan = await db.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      return { error: 'Pack introuvable.' };
    }
    if (plan.archivedAt) {
      return { error: "Ce pack est archivé : il n'est plus proposé." };
    }
    const mismatch = audienceMismatchError('SUPPLIER', plan.audience);
    if (mismatch) {
      return { error: mismatch };
    }
  }

  const created = await db.company.create({
    data: {
      kind: 'SUPPLIER',
      name,
      address: '',
      phone,
      email,
      legalRepFullName: contactName,
      anmeCode: placeholderAnmeCode(),
      anmeCategory: 'BT',
      anmeValidFrom: PLACEHOLDER_ANME_DATE,
      anmeValidTo: PLACEHOLDER_ANME_DATE,
      profileComplete: true,
      users: {
        create: { email: ownerEmail, fullName: contactName, role: 'OWNER', passwordHash: await hashPassword(ownerPassword) },
      },
      ...(planId !== null && periodEnd !== null
        ? { subscription: { create: { planId, status: 'ACTIVE', periodStart: new Date(), periodEnd } } }
        : {}),
    },
  });
  await logAdminAction(admin.id, 'supplier.create', created.id, {
    name,
    ownerEmail,
    planId,
    periodEnd: periodEnd?.toISOString() ?? null,
  });
  redirect(withNotice(`/admin/fournisseurs/${created.id}`, 'supplierCreated'));
}
