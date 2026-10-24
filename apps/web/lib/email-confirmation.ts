import { db } from '@dossipv/db';

/**
 * True for a self sign-up user whose email address is not confirmed yet: the free trial only
 * starts once it is, so until then the app must not talk about a missing subscription.
 */
export async function isAwaitingEmailConfirmation(companyUserId: string): Promise<boolean> {
  const user = await db.companyUser.findUnique({
    where: { id: companyUserId },
    select: { emailVerifiedAt: true, company: { select: { signupAt: true } } },
  });
  return Boolean(user && user.company.signupAt && !user.emailVerifiedAt);
}
