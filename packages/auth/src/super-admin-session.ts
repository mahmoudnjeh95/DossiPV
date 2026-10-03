import { db } from '@dossipv/db';
import { verifyPassword } from './password';
import { generateToken, hashToken } from './tokens';
import { RateLimiter } from './rate-limit';
import { InvalidCredentialsError, TooManyAttemptsError, SESSION_LIFETIME_MS, DUMMY_PASSWORD_HASH } from './company-session';

const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const superAdminRateLimiter = new RateLimiter(RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS);

export interface AuthenticatedSuperAdmin {
  id: string;
  email: string;
}

export interface SuperAdminLoginResult {
  admin: AuthenticatedSuperAdmin;
  token: string;
}

export async function loginSuperAdmin(email: string, plainPassword: string): Promise<SuperAdminLoginResult> {
  // See the matching comment in company-session.ts's login(): this is a fast-path rejection
  // only, not the authoritative check — each recordFailure() call's own return value below is
  // what actually enforces the lock atomically.
  if (superAdminRateLimiter.isLocked(email)) {
    throw new TooManyAttemptsError();
  }

  const admin = await db.superAdmin.findUnique({ where: { email } });

  // Always run bcrypt.compare(), even for an unknown email — see DUMMY_PASSWORD_HASH's own
  // comment in company-session.ts for why this closes a timing-based user-enumeration gap
  // that the identical error message alone does not.
  const passwordMatches = await verifyPassword(plainPassword, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!admin || !passwordMatches) {
    if (superAdminRateLimiter.recordFailure(email)) {
      throw new TooManyAttemptsError();
    }
    throw new InvalidCredentialsError();
  }

  superAdminRateLimiter.clear(email);

  const rawToken = generateToken();
  await db.superAdminSession.create({
    data: {
      superAdminId: admin.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    },
  });

  return { admin: { id: admin.id, email: admin.email }, token: rawToken };
}

export async function logoutSuperAdmin(rawToken: string): Promise<void> {
  await db.superAdminSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function validateSuperAdminSession(rawToken: string): Promise<AuthenticatedSuperAdmin | null> {
  const session = await db.superAdminSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { superAdmin: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  await db.superAdminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });

  return { id: session.superAdmin.id, email: session.superAdmin.email };
}
