'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { login, AccountDisabledError, EmailNotVerifiedError, InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';
import { shouldUseSecureCookie } from '../../lib/cookie-secure';

const SESSION_COOKIE_NAME = 'dossipv_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // matches @dossipv/auth's SESSION_LIFETIME_MS

export interface LoginActionState {
  error: string;
  /** Set when the address is not confirmed yet: the form then offers to resend the confirmation email. */
  unverifiedEmail?: string;
}

export async function loginAction(
  _prevState: LoginActionState | undefined,
  formData: FormData,
): Promise<LoginActionState | undefined> {
  const emailField = formData.get('email');
  const passwordField = formData.get('password');

  if (typeof emailField !== 'string' || typeof passwordField !== 'string') {
    return { error: 'Email ou mot de passe incorrect.' };
  }

  // Only the login() call is inside this try — redirect() below runs outside any catch that
  // could intercept its internal throw.
  let token: string;
  let companyId: string;
  try {
    const result = await login(emailField, passwordField);
    token = result.token;
    companyId = result.user.companyId;
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: 'Email ou mot de passe incorrect.' };
    }
    if (error instanceof TooManyAttemptsError) {
      return { error: 'Trop de tentatives échouées. Réessayez plus tard.' };
    }
    if (error instanceof EmailNotVerifiedError) {
      return {
        error: "Confirmez votre adresse email : cliquez sur le lien reçu à l'inscription. Il ne vous est pas parvenu ? Demandez un nouvel email ci-dessous.",
        unverifiedEmail: emailField.trim().toLowerCase(),
      };
    }
    if (error instanceof AccountDisabledError) {
      return { error: 'Ce compte est désactivé. Contactez SolarixPro pour le réactiver.' };
    }
    throw error;
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: await shouldUseSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  // A supplier company lands in its own space, an installer on its dashboard.
  const company = await db.company.findUnique({ where: { id: companyId }, select: { kind: true } });
  redirect(company?.kind === 'SUPPLIER' ? '/fournisseur' : '/dashboard');
}
