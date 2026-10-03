import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSession, type AuthenticatedCompanyUser } from '@dossipv/auth';
import { AppShell } from '../../components/app-shell';

const SESSION_COOKIE_NAME = 'dossipv_session';

/**
 * Exported separately from the layout component so it has its own direct unit tests (a
 * Server Component layout isn't easily rendered in this repo's Vitest setup).
 */
export async function requireAuthenticatedCompanyUser(): Promise<AuthenticatedCompanyUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login');
    return undefined as never;
  }

  const user = await validateSession(token);

  if (!user) {
    redirect('/login');
    return undefined as never;
  }

  return user;
}

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  return <AppShell userFullName={user.fullName}>{children}</AppShell>;
}
