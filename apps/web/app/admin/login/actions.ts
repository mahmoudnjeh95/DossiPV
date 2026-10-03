'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSuperAdmin, InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

const ADMIN_SESSION_COOKIE_NAME = 'dossipv_admin_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface LoginAdminActionState {
  error: string;
}

export async function loginAdminAction(
  _prevState: LoginAdminActionState | undefined,
  formData: FormData,
): Promise<LoginAdminActionState | undefined> {
  const emailField = formData.get('email');
  const passwordField = formData.get('password');

  if (typeof emailField !== 'string' || typeof passwordField !== 'string') {
    return { error: 'Email ou mot de passe incorrect.' };
  }

  let token: string;
  try {
    const result = await loginSuperAdmin(emailField, passwordField);
    token = result.token;
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: 'Email ou mot de passe incorrect.' };
    }
    if (error instanceof TooManyAttemptsError) {
      return { error: 'Trop de tentatives échouées. Réessayez plus tard.' };
    }
    throw error;
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect('/admin');
}
