import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { validateSession, type AuthenticatedCompanyUser } from '@dossipv/auth';
import { AppShell } from '../../components/app-shell';
import { requireCurrentTerms } from '../../lib/terms-gate';
import { dismissLibraryHintAction, endImpersonationAction } from './actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const SESSION_COOKIE_NAME = 'dossipv_session';

/**
 * Exported separately from the layout component so it has its own direct unit tests (a
 * Server Component layout isn't easily rendered in this repo's Vitest setup).
 */
export async function requireAuthenticatedCompanyUser(): Promise<AuthenticatedCompanyUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login?connexion=requise');
    return undefined as never;
  }

  const user = await validateSession(token);

  if (!user) {
    redirect('/login?connexion=requise');
    return undefined as never;
  }

  return user;
}

/**
 * The signed-in user of an INSTALLER company, for the installer actions (projects, library, bill
 * import, generation…). The layout only guards the pages: a server action can be posted from any
 * page, so a supplier company (which has its own space) is refused here too, before it can spend
 * the paid bill reading or generate dossiers.
 */
export async function requireInstallerUser(): Promise<AuthenticatedCompanyUser> {
  const user = await requireAuthenticatedCompanyUser();
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { kind: true } });
  if (company?.kind === 'SUPPLIER') {
    redirect('/fournisseur');
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
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { profileComplete: true, kind: true, libraryHintPending: true } });
  // A supplier company has its own space: the installer app is not for it.
  if (company?.kind === 'SUPPLIER') {
    redirect('/fournisseur');
    return undefined as never;
  }
  await requireCurrentTerms(user);
  return (
    <>
      {user.impersonatedBySuperAdminId && <ImpersonationBanner fullName={user.fullName} email={user.email} />}
      {company && !company.profileComplete && <ProfileIncompleteBanner />}
      {company?.libraryHintPending && <LibraryHintBanner />}
      <AppShell userFullName={user.fullName}>{children}</AppShell>
    </>
  );
}

/** Above every page until a self sign-up company has filled its profile: generation is refused meanwhile. */
function ProfileIncompleteBanner(): React.JSX.Element {
  return (
    <Alert variant="warn" role="status" style={{ margin: 0, borderRadius: 0, textAlign: 'center' }}>
      Complétez le profil de votre société (adresse, représentant légal, agrément ANME) pour pouvoir générer des
      dossiers : <Link href="/settings">ouvrir les Paramètres</Link>.
    </Alert>
  );
}

/**
 * Above every page of a new company until dismissed: its library starts with the whole shared
 * catalog, so it is asked to keep only what it installs and to add its own equipment.
 */
function LibraryHintBanner(): React.JSX.Element {
  return (
    <Alert
      variant="info"
      role="status"
      style={{ margin: 0, borderRadius: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}
    >
      <span>
        Votre bibliothèque contient tout le catalogue partagé. Gérez-la : retirez le matériel que vous n’installez pas et
        ajoutez le vôtre, seul ce matériel vous sera proposé dans vos projets. <Link href="/library">Gérer ma bibliothèque</Link>
      </span>
      <form action={dismissLibraryHintAction}>
        <Button variant="secondary" size="sm" type="submit">
          Compris
        </Button>
      </form>
    </Alert>
  );
}

/** Above every page of a support session a super admin opened as this user (spec §4). */
function ImpersonationBanner({ fullName, email }: { fullName: string; email: string }): React.JSX.Element {
  return (
    <Alert variant="warn"
      
      role="status"
      style={{ margin: 0, borderRadius: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}
    >
      <span>
        Mode support : vous êtes connecté en tant que {fullName} ({email})
      </span>
      <form action={endImpersonationAction}>
        <Button variant="secondary" size="sm" type="submit">
          Terminer
        </Button>
      </form>
    </Alert>
  );
}
