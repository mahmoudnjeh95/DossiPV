import { cookies } from 'next/headers';
import { validateSession } from '@dossipv/auth';
import { db } from '@dossipv/db';

const SESSION_COOKIE_NAME = 'dossipv_session';

/** The installer company signed in on this browser, or null (nobody, or a supplier). For public pages. */
export async function currentInstallerCompany(): Promise<{ companyId: string; email: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) return null;
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { kind: true } });
  return company?.kind === 'INSTALLER' ? { companyId: user.companyId, email: user.email } : null;
}
