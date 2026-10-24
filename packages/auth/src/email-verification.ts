import { db } from '@dossipv/db';
import { generateToken, hashToken } from './tokens';

/** The link in the sign-up email stays valid two days. */
export const EMAIL_VERIFICATION_LIFETIME_MS = 48 * 60 * 60 * 1000;

/** The link is unknown, used already, expired or its account was disabled. */
export class InvalidVerificationTokenError extends Error {
  constructor() {
    super('This verification link is invalid or has expired.');
    this.name = 'InvalidVerificationTokenError';
  }
}

/**
 * A new one-time link that confirms this user's email; earlier unused links of the user stop
 * working. Returns the raw token for the emailed link (only its hash is stored).
 */
export async function createEmailVerificationToken(companyUserId: string): Promise<string> {
  const rawToken = generateToken();
  await db.$transaction([
    db.emailVerificationToken.deleteMany({ where: { companyUserId, usedAt: null } }),
    db.emailVerificationToken.create({
      data: { companyUserId, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_LIFETIME_MS) },
    }),
  ]);
  return rawToken;
}

/**
 * Confirms the email behind a link, once: marks the user verified and uses the link up. Returns
 * the user, its company and its email.
 */
export async function verifyEmailWithToken(rawToken: string): Promise<{ companyUserId: string; companyId: string; email: string }> {
  const tokenHash = hashToken(rawToken);
  const token = await db.emailVerificationToken.findUnique({ where: { tokenHash }, include: { companyUser: true } });
  if (!token || token.usedAt || token.expiresAt <= new Date() || token.companyUser.disabledAt) throw new InvalidVerificationTokenError();
  await db.$transaction(async (tx) => {
    // Used up atomically: of two clicks racing on the same link, only one confirms.
    const used = await tx.emailVerificationToken.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new InvalidVerificationTokenError();
    await tx.companyUser.update({ where: { id: token.companyUserId }, data: { emailVerifiedAt: new Date() } });
  });
  return { companyUserId: token.companyUserId, companyId: token.companyUser.companyId, email: token.companyUser.email };
}
