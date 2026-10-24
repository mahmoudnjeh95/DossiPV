import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
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
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { profileComplete: true, kind: true } });
  // A supplier company has its own space: the installer app is not for it.
  if (company?.kind === 'SUPPLIER') {
    redirect('/fournisseur');
    return undefined as never;
  }
  return (
    <>
      {user.impersonatedBySuperAdminId && <ImpersonationBanner fullName={user.fullName} email={user.email} />}
      {company && !company.profileComplete && <ProfileIncompleteBanner />}
      <AppShell userFullName={user.fullName}>{children}</AppShell>
    </>
  );
}

/** Above every page until a self sign-up company has filled its profile: generation is refused meanwhile. */
function ProfileIncompleteBanner(): React.JSX.Element {
  return (
    <div className="banner banner-warn" role="status" style={{ margin: 0, borderRadius: 0, textAlign: 'center' }}>
      Complétez le profil de votre société (adresse, représentant légal, agrément ANME) pour pouvoir générer des
      dossiers : <Link href="/settings">ouvrir les Paramètres</Link>.
    </div>
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
