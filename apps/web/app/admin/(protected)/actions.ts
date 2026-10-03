'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logoutSuperAdmin } from '@dossipv/auth';

const ADMIN_SESSION_COOKIE_NAME = 'dossipv_admin_session';

export async function logoutAdminAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (token) {
    await logoutSuperAdmin(token);
  }

  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
  redirect('/admin/login');
}
