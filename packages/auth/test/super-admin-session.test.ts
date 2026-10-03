import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@dossipv/db';
import { hashPassword } from '../src/password';
import { hashToken } from '../src/tokens';
import {
  loginSuperAdmin,
  logoutSuperAdmin,
  validateSuperAdminSession,
} from '../src/super-admin-session';
import { InvalidCredentialsError, TooManyAttemptsError } from '../src/company-session';

const TEST_PASSWORD = 'super-admin-password';
let adminId: string;
let adminEmail: string;

beforeEach(async () => {
  adminEmail = `admin-${Date.now()}-${Math.random()}@example.com`;
  const admin = await db.superAdmin.create({
    data: { email: adminEmail, passwordHash: await hashPassword(TEST_PASSWORD) },
  });
  adminId = admin.id;
});

afterEach(async () => {
  await db.superAdminSession.deleteMany({ where: { superAdminId: adminId } });
  await db.superAdmin.delete({ where: { id: adminId } });
});

describe('loginSuperAdmin', () => {
  it('succeeds with correct credentials and creates a matching SuperAdminSession row', async () => {
    const result = await loginSuperAdmin(adminEmail, TEST_PASSWORD);
    expect(result.admin.id).toBe(adminId);
    const sessionRow = await db.superAdminSession.findUnique({ where: { tokenHash: hashToken(result.token) } });
    expect(sessionRow).not.toBeNull();
  });

  it('throws InvalidCredentialsError for an unknown email', async () => {
    await expect(loginSuperAdmin('nobody@example.com', TEST_PASSWORD)).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for a wrong password', async () => {
    await expect(loginSuperAdmin(adminEmail, 'wrong-password')).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws TooManyAttemptsError after repeated failures', async () => {
    for (let i = 0; i < 10; i++) {
      try {
        await loginSuperAdmin(adminEmail, 'wrong-password');
      } catch {
        // expected on early attempts
      }
    }
    await expect(loginSuperAdmin(adminEmail, TEST_PASSWORD)).rejects.toThrow(TooManyAttemptsError);
  });
});

describe('validateSuperAdminSession', () => {
  it('resolves a valid token to the right admin', async () => {
    const { token } = await loginSuperAdmin(adminEmail, TEST_PASSWORD);
    const resolved = await validateSuperAdminSession(token);
    expect(resolved?.id).toBe(adminId);
  });

  it('returns null for an unknown token', async () => {
    expect(await validateSuperAdminSession('nonexistent-token')).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const expiredToken = 'expired-super-admin-token';
    await db.superAdminSession.create({
      data: { superAdminId: adminId, tokenHash: hashToken(expiredToken), expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateSuperAdminSession(expiredToken)).toBeNull();
  });
});

describe('logoutSuperAdmin', () => {
  it('deletes the matching session', async () => {
    const { token } = await loginSuperAdmin(adminEmail, TEST_PASSWORD);
    await logoutSuperAdmin(token);
    expect(await validateSuperAdminSession(token)).toBeNull();
  });
});
