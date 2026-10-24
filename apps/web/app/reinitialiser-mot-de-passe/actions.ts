'use server';

import { redirect } from 'next/navigation';
import { InvalidResetTokenError, MIN_PASSWORD_LENGTH, resetPasswordWithToken, WeakPasswordError } from '@dossipv/auth';

/** bcrypt ignores everything past 72 bytes, so a longer password would not be what it seems. */
const MAX_PASSWORD_LENGTH = 72;

export interface ResetPasswordState {
  error: string;
}

const INVALID_LINK = 'Ce lien n’est plus valide. Demandez un nouveau lien depuis « Mot de passe oublié ».';

export async function resetPasswordAction(
  _prevState: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState | undefined> {
  const token = formData.get('token');
  const password = formData.get('password');
  const confirmation = formData.get('confirmation');

  if (typeof token !== 'string' || token.length === 0) return { error: INVALID_LINK };
  // Kept exactly as typed: no trimming of a password.
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit comporter au plus ${MAX_PASSWORD_LENGTH} caractères.` };
  }
  if (password !== confirmation) {
    return { error: 'Les deux mots de passe ne correspondent pas.' };
  }

  // Only the reset is inside this try — redirect() below runs outside any catch that could
  // intercept its internal throw.
  try {
    await resetPasswordWithToken(token, password);
  } catch (error) {
    if (error instanceof WeakPasswordError) {
      return { error: `Le mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.` };
    }
    if (error instanceof InvalidResetTokenError) return { error: INVALID_LINK };
    throw error;
  }

  redirect('/login?reinitialise=1');
}
