import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSession, type AuthenticatedCompanyUser } from '@dossipv/auth';
import { AppShell } from '../../components/app-shell';
import { endImpersonationAction } from './actions';

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
  return (
    <>
      {user.impersonatedBySuperAdminId && <ImpersonationBanner fullName={user.fullName} email={user.email} />}
      <AppShell userFullName={user.fullName}>{children}</AppShell>
    </>
  );
}

/** Above every page of a support session a super admin opened as this user (spec §4). */
function ImpersonationBanner({ fullName, email }: { fullName: string; email: string }): React.JSX.Element {
  return (
    <div
      className="banner banner-warn"
      role="status"
      style={{ margin: 0, borderRadius: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}
    >
      <span>
        Mode support : vous êtes connecté en tant que {fullName} ({email})
      </span>
      <form action={endImpersonationAction}>
        <button type="submit" className="secondary small">
          Terminer
        </button>
      </form>
    </div>
  );
}
