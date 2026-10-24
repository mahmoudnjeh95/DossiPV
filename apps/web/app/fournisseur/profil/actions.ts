'use server';

import { cookies } from 'next/headers';
import { db } from '@dossipv/db';
import { hashPassword, hashToken, MIN_PASSWORD_LENGTH, verifyPassword } from '@dossipv/auth';
import { requireSupplier } from '../../../lib/supplier-access';

const SESSION_COOKIE_NAME = 'dossipv_session';
/** bcrypt ignores everything past 72 bytes, so a longer password would not be what it seems. */
const MAX_PASSWORD_LENGTH = 72;

export type ChangePasswordState = { error: string } | { done: true } | undefined;

/** Changes the signed-in supplier user's own password; its other sessions are closed, this one stays. */
export async function changePasswordAction(_prevState: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const { user } = await requireSupplier();
  if (user.impersonatedBySuperAdminId) return { error: 'Mode support : le changement de mot de passe est désactivé.' };

  const current = formData.get('currentPassword');
  const password = formData.get('password');
  const confirmation = formData.get('confirmation');
  // Kept exactly as typed: no trimming of a password.
  if (typeof current !== 'string' || current.length === 0) return { error: 'Saisissez votre mot de passe actuel.' };
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le nouveau mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { error: `Le nouveau mot de passe doit comporter au plus ${MAX_PASSWORD_LENGTH} caractères.` };
  }
  if (password !== confirmation) return { error: 'Les deux mots de passe ne correspondent pas.' };

  const record = await db.companyUser.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record || !(await verifyPassword(current, record.passwordHash))) return { error: 'Le mot de passe actuel est incorrect.' };

  const passwordHash = await hashPassword(password);
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  await db.$transaction([
    db.companyUser.update({ where: { id: user.id }, data: { passwordHash } }),
    db.session.deleteMany({ where: { companyUserId: user.id, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) } }),
  ]);
  return { done: true };
}
