'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { logout, validateSession } from '@dossipv/auth';
import { db } from '@dossipv/db';
import { logAdminAction } from '../../lib/admin-audit';

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

/**
 * "Terminer" in the support banner: ends the session a super admin opened as this installer and
 * goes back to the company's admin page (the admin's own session cookie is untouched). A normal
 * session that reaches here is simply logged out.
 */
export async function endImpersonationAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await validateSession(token) : null;

  if (token) {
    await logout(token);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);

  if (!user?.impersonatedBySuperAdminId) {
    redirect('/login');
    return;
  }
  await logAdminAction(user.impersonatedBySuperAdminId, 'impersonation.end', user.companyId, { userId: user.id, email: user.email });
  redirect(`/admin/installers/${user.companyId}`);
}

/**
 * « Compris » on the library hint: the company has seen it, it no longer shows. A support session
 * leaves it for the installer to see.
 */
export async function dismissLibraryHintAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await validateSession(token) : null;
  if (!user || user.impersonatedBySuperAdminId) return;
  await db.company.update({ where: { id: user.companyId }, data: { libraryHintPending: false } });
  revalidatePath('/', 'layout');
}
