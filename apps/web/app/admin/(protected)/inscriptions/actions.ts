'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { FormReader } from '../../../../lib/form-reader';
import { withNotice } from '../../../../lib/admin-notice';
import { logAdminAction } from '../../../../lib/admin-audit';

export interface SignupActionState {
  error: string;
}

/** Marks a self sign-up as contacted (now), with a free note on what was said. */
export async function markSignupContactedAction(
  companyId: string,
  _prevState: SignupActionState | undefined,
  formData: FormData,
): Promise<SignupActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const note = reader.optionalText('note', 'Note', 1000);
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const company = await db.company.findUnique({ where: { id: companyId }, select: { signupAt: true } });
  if (!company?.signupAt) {
    return { error: "Cette société n'est pas une inscription." };
  }

  await db.company.update({ where: { id: companyId }, data: { signupContactedAt: new Date(), signupNote: note } });
  await logAdminAction(admin.id, 'signup.contacted', companyId, { note });
  redirect(withNotice(`/admin/installers/${companyId}`, 'signupContacted'));
}

/** Puts a self sign-up back in the "À contacter" list and clears its note. */
export async function markSignupUncontactedAction(companyId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();

  const company = await db.company.findUnique({ where: { id: companyId }, select: { signupAt: true } });
  if (company?.signupAt) {
    await db.company.update({ where: { id: companyId }, data: { signupContactedAt: null, signupNote: null } });
    await logAdminAction(admin.id, 'signup.uncontacted', companyId);
  }
  redirect(withNotice(`/admin/installers/${companyId}`, 'signupUncontacted'));
}
