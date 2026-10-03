import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSuperAdminSession, type AuthenticatedSuperAdmin } from '@dossipv/auth';

const ADMIN_SESSION_COOKIE_NAME = 'dossipv_admin_session';

export async function requireAuthenticatedSuperAdmin(): Promise<AuthenticatedSuperAdmin> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/admin/login');
    return undefined as never;
  }

  const admin = await validateSuperAdminSession(token);

  if (!admin) {
    redirect('/admin/login');
    return undefined as never;
  }

  return admin;
}

export default async function AdminProtectedLayout({ children }: { children: ReactNode }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  return <>{children}</>;
}
