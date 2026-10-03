'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logout } from '@dossipv/auth';

const SESSION_COOKIE_NAME = 'dossipv_session';

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await logout(token);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}
