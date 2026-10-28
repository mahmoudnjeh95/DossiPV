import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSuperAdminSession, type AuthenticatedSuperAdmin } from '@dossipv/auth';
import { AdminShell } from '../../../components/admin-shell';
import { AdminNotice } from './components/admin-notice';
import { NO_INDEX } from '../../../lib/site';

// Behind a login or a one-time token: never in search results.
export const metadata: Metadata = { robots: NO_INDEX };

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
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <AdminNotice />
      </Suspense>
      {children}
    </AdminShell>
  );
}
