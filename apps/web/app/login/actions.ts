'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { login, InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

const SESSION_COOKIE_NAME = 'dossipv_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // matches @dossipv/auth's SESSION_LIFETIME_MS

export interface LoginActionState {
  error: string;
}

export async function loginAction(
  _prevState: LoginActionState | undefined,
  formData: FormData,
): Promise<LoginActionState | undefined> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  // Only the login() call is inside this try — redirect() below runs outside any catch that
  // could intercept its internal throw.
  let token: string;
  try {
    const result = await login(email, password);
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
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect('/dashboard');
}
