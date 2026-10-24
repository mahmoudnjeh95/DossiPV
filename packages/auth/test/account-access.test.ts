import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@dossipv/db';
import { hashPassword, verifyPassword } from '../src/password';
import { hashToken } from '../src/tokens';
import { AccountDisabledError, createImpersonationSession, login, MAX_CONCURRENT_SESSIONS_PER_COMPANY, validateSession } from '../src/company-session';
import {
  ACCOUNT_SETUP_LIFETIME_MS,
  createPasswordResetToken,
  findValidPasswordResetToken,
  InvalidResetTokenError,
  resetPasswordWithToken,
  WeakPasswordError,
} from '../src/password-reset';

const TEST_PASSWORD = 'correct-horse-battery-staple';
let companyId: string;
let userId: string;
let userEmail: string;
let superAdminId: string;

beforeEach(async () => {
  const company = await db.company.create({
    data: {
      name: 'Access Co',
      address: 'Test address',
      phone: '+216 00 000 000',
      email: 'access@example.com',
      legalRepFullName: 'Test Rep',
      anmeCode: 'TEST-ACCESS',
      anmeCategory: 'BT',
      anmeValidFrom: new Date('2024-01-01'),
      anmeValidTo: new Date('2030-01-01'),
    },
  });
  companyId = company.id;
  userEmail = `access-${company.id}@example.com`;
  const user = await db.companyUser.create({
    data: { companyId, email: userEmail, passwordHash: await hashPassword(TEST_PASSWORD), fullName: 'Access User', role: 'OWNER' },
  });
  userId = user.id;
  const admin = await db.superAdmin.create({ data: { email: `admin-${company.id}@example.com`, passwordHash: await hashPassword('admin-password') } });
  superAdminId = admin.id;
});

afterEach(async () => {
  await db.session.deleteMany({ where: { companyUser: { companyId } } });
  await db.passwordResetToken.deleteMany({ where: { companyUser: { companyId } } });
  await db.companyUser.deleteMany({ where: { companyId } });
  await db.company.delete({ where: { id: companyId } });
  await db.superAdmin.delete({ where: { id: superAdminId } });
});

describe('disabled accounts', () => {
  it('cannot log in with the right password, and their open sessions stop working', async () => {
    const { token } = await login(userEmail, TEST_PASSWORD);
    await db.companyUser.update({ where: { id: userId }, data: { disabledAt: new Date() } });

    await expect(login(userEmail, TEST_PASSWORD)).rejects.toBeInstanceOf(AccountDisabledError);
    expect(await validateSession(token)).toBeNull();
  });
});

describe('password reset links', () => {
  it('set a new password once, close every session and stop working', async () => {
    const { token: session } = await login(userEmail, TEST_PASSWORD);
    const link = await createPasswordResetToken(userId);
    expect(await findValidPasswordResetToken(link)).toEqual({ companyUserId: userId, email: userEmail });

    await resetPasswordWithToken(link, 'a-brand-new-password');

    const user = await db.companyUser.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword('a-brand-new-password', user.passwordHash)).toBe(true);
    expect(await validateSession(session)).toBeNull();
    await expect(resetPasswordWithToken(link, 'yet-another-password')).rejects.toBeInstanceOf(InvalidResetTokenError);
    expect(await findValidPasswordResetToken(link)).toBeNull();
  });

  it('only the latest link works, an expired one does not, and a short password is refused', async () => {
    const first = await createPasswordResetToken(userId);
    const second = await createPasswordResetToken(userId, ACCOUNT_SETUP_LIFETIME_MS);
    expect(await findValidPasswordResetToken(first)).toBeNull();
    await expect(resetPasswordWithToken(second, 'short')).rejects.toBeInstanceOf(WeakPasswordError);

    await db.passwordResetToken.update({ where: { tokenHash: hashToken(second) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPasswordWithToken(second, 'long-enough-password')).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it('is refused for a disabled account', async () => {
    const link = await createPasswordResetToken(userId);
    await db.companyUser.update({ where: { id: userId }, data: { disabledAt: new Date() } });
    await expect(resetPasswordWithToken(link, 'long-enough-password')).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});

describe('impersonation sessions', () => {
  it('open the app as the user, marked with the admin, for one hour', async () => {
    const token = await createImpersonationSession(superAdminId, userId);

    const user = await validateSession(token);
    expect(user).toMatchObject({ id: userId, companyId, impersonatedBySuperAdminId: superAdminId });
    const row = await db.session.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("neither count against nor evict the installer's own sessions", async () => {
    const support = await createImpersonationSession(superAdminId, userId);
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS_PER_COMPANY; i += 1) await login(userEmail, TEST_PASSWORD);

    expect(await validateSession(support)).not.toBeNull();
    expect(await db.session.count({ where: { companyUserId: userId, impersonatedBySuperAdminId: null } })).toBe(MAX_CONCURRENT_SESSIONS_PER_COMPANY);
  });
});
