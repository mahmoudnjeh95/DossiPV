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

/** The right password for an account the admin disabled. */
export class AccountDisabledError extends Error {
  constructor() {
    super('This account is disabled.');
    this.name = 'AccountDisabledError';
  }
}

/** The right password, but the email of a self sign-up was not confirmed yet. */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('The email address is not verified yet.');
    this.name = 'EmailNotVerifiedError';
  }
}

export interface AuthenticatedCompanyUser {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'MEMBER';
  /** Set when a super admin opened this session to see the app as the installer (support). */
  impersonatedBySuperAdminId?: string | null;
}

/** How long a support session opened by a super admin lasts. */
export const IMPERSONATION_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

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

export async function login(typedEmail: string, plainPassword: string): Promise<LoginResult> {
  // One key per address whatever the capitals typed, or varying them would dodge the lockout.
  const email = typedEmail.trim().toLowerCase();
  // Fast-path rejection before touching the database at all. The authoritative check is each
  // recordFailure() call's own return value below — this isLocked() call only avoids the
  // wasted work of a DB lookup + bcrypt compare for a key that's already locked; it is not
  // what actually enforces the lock (see the comment on recordFailure() in rate-limit.ts for
  // why checking isLocked() separately from recordFailure() would race).
  if (loginRateLimiter.isLocked(email)) {
    throw new TooManyAttemptsError();
  }

  // Typed capitals or a trailing space must not lock a user out: emails are matched ignoring case.
  const user = await db.companyUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, include: { company: { select: { signupAt: true } } } });

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

  if (user.disabledAt) {
    throw new AccountDisabledError();
  }
  // Only a self sign-up has to confirm its email; accounts the admin created are trusted.
  if (user.company.signupAt && !user.emailVerifiedAt) {
    throw new EmailNotVerifiedError();
  }

  // The installer's own sessions: a support session opened by the admin neither counts nor is evicted.
  const ownActiveSessions = { companyUser: { companyId: user.companyId }, expiresAt: { gt: new Date() }, impersonatedBySuperAdminId: null };
  const activeSessionCount = await db.session.count({ where: ownActiveSessions });

  if (activeSessionCount >= MAX_CONCURRENT_SESSIONS_PER_COMPANY) {
    const oldest = await db.session.findFirst({
      where: ownActiveSessions,
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

  if (!session || session.expiresAt <= new Date() || session.companyUser.disabledAt) {
    return null;
  }

  await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });

  const user = session.companyUser;
  return {
    id: user.id,
    companyId: user.companyId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    impersonatedBySuperAdminId: session.impersonatedBySuperAdminId,
  };
}

/**
 * Opens a support session for a super admin as this installer user ("Se connecter en tant que"):
 * a normal session token, marked with the admin and limited to IMPERSONATION_LIFETIME_MS. It is
 * ended with `logout` like any session. Returns the raw token for the session cookie.
 */
export async function createImpersonationSession(superAdminId: string, companyUserId: string): Promise<string> {
  const rawToken = generateToken();
  await db.session.create({
    data: {
      companyUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + IMPERSONATION_LIFETIME_MS),
      impersonatedBySuperAdminId: superAdminId,
    },
  });
  return rawToken;
}
