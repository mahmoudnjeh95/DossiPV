import { db } from '@dossipv/db';
import { verifyPassword } from './password';
import { generateToken, hashToken } from './tokens';
import { RateLimiter } from './rate-limit';

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MAX_CONCURRENT_SESSIONS_PER_COMPANY = 3;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginRateLimiter = new RateLimiter(RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS);

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password.');
    this.name = 'InvalidCredentialsError';
  }
}

export class TooManyAttemptsError extends Error {
  constructor() {
    super('Too many failed login attempts. Try again later.');
    this.name = 'TooManyAttemptsError';
  }
}

export interface AuthenticatedCompanyUser {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'MEMBER';
}

export interface LoginResult {
  user: AuthenticatedCompanyUser;
  token: string;
}

/**
 * A precomputed bcrypt hash of a random, unknown password — never matches any real password.
 * Used only to give the unknown-email login path the same bcrypt.compare() cost as the
 * known-email path, so the two are indistinguishable by response TIMING, not just by error
 * message. Without this, an unknown email returns after one fast DB lookup while a known
 * email with a wrong password additionally pays bcrypt's deliberately slow compare — a
 * reliable timing side-channel for user enumeration even though both throw the identical
 * InvalidCredentialsError with the identical message (found by an automated security review
 * after the identical-message test alone didn't catch it; that test never measured timing).
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8r6zQ1qg5ZYzgKfOjQ5Z2XqUxOR8Vq';

export async function login(email: string, plainPassword: string): Promise<LoginResult> {
  // Fast-path rejection before touching the database at all. The authoritative check is each
  // recordFailure() call's own return value below — this isLocked() call only avoids the
  // wasted work of a DB lookup + bcrypt compare for a key that's already locked; it is not
  // what actually enforces the lock (see the comment on recordFailure() in rate-limit.ts for
  // why checking isLocked() separately from recordFailure() would race).
  if (loginRateLimiter.isLocked(email)) {
    throw new TooManyAttemptsError();
  }

  const user = await db.companyUser.findUnique({ where: { email } });

  // Always run bcrypt.compare(), even for an unknown email, against a fixed dummy hash — see
  // DUMMY_PASSWORD_HASH's own comment for why this matters beyond just the error message.
  const passwordMatches = await verifyPassword(plainPassword, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    if (loginRateLimiter.recordFailure(email)) {
      throw new TooManyAttemptsError();
    }
    throw new InvalidCredentialsError();
  }

  loginRateLimiter.clear(email);

  const activeSessionCount = await db.session.count({
    where: { companyUser: { companyId: user.companyId }, expiresAt: { gt: new Date() } },
  });

  if (activeSessionCount >= MAX_CONCURRENT_SESSIONS_PER_COMPANY) {
    const oldest = await db.session.findFirst({
      where: { companyUser: { companyId: user.companyId }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    if (oldest) {
      await db.session.delete({ where: { id: oldest.id } });
    }
  }

  const rawToken = generateToken();
  await db.session.create({
    data: {
      companyUserId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    },
  });

  return {
    user: { id: user.id, companyId: user.companyId, email: user.email, fullName: user.fullName, role: user.role },
    token: rawToken,
  };
}

export async function logout(rawToken: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function validateSession(rawToken: string): Promise<AuthenticatedCompanyUser | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { companyUser: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });

  const user = session.companyUser;
  return { id: user.id, companyId: user.companyId, email: user.email, fullName: user.fullName, role: user.role };
}
