import { db } from '@dossipv/db';
import { hashPassword } from './password';
import { generateToken, hashToken } from './tokens';

/** A link from "mot de passe oublié" stays valid one hour. */
export const PASSWORD_RESET_LIFETIME_MS = 60 * 60 * 1000;
/** A link the admin sends to a new account's user stays valid a week, time to read the email. */
export const ACCOUNT_SETUP_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

/** The link is unknown, used already, expired, or its account was disabled. */
export class InvalidResetTokenError extends Error {
  constructor() {
    super('This password reset link is invalid or has expired.');
    this.name = 'InvalidResetTokenError';
  }
}

export class WeakPasswordError extends Error {
  constructor() {
    super(`The password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = 'WeakPasswordError';
  }
}

/**
 * A new one-time link to choose a password for this user; earlier unused links of the user stop
 * working. Returns the raw token to put in the emailed link (only its hash is stored).
 */
export async function createPasswordResetToken(companyUserId: string, lifetimeMs = PASSWORD_RESET_LIFETIME_MS): Promise<string> {
  const rawToken = generateToken();
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { companyUserId, usedAt: null } }),
    db.passwordResetToken.create({ data: { companyUserId, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + lifetimeMs) } }),
  ]);
  return rawToken;
}

/** The account a reset link is for, while the link can still be used; null otherwise. */
export async function findValidPasswordResetToken(rawToken: string): Promise<{ companyUserId: string; email: string } | null> {
  const token = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { companyUser: true } });
  if (!token || token.usedAt || token.expiresAt <= new Date() || token.companyUser.disabledAt) return null;
  return { companyUserId: token.companyUserId, email: token.companyUser.email };
}

/**
 * Sets the new password from a reset link, uses the link up and closes every open session of the
 * account (whoever knew the old password is logged out).
 */
export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<{ companyUserId: string }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
  const valid = await findValidPasswordResetToken(rawToken);
  if (!valid) throw new InvalidResetTokenError();
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    // Used up atomically: of two requests racing with the same link, only one sets a password.
    const used = await tx.passwordResetToken.updateMany({
      where: { tokenHash: hashToken(rawToken), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new InvalidResetTokenError();
    await tx.companyUser.update({ where: { id: valid.companyUserId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { companyUserId: valid.companyUserId } });
  });
  return { companyUserId: valid.companyUserId };
}
