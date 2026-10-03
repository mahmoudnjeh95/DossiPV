import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@dossipv/db';
import { hashPassword } from '../src/password';
import { hashToken } from '../src/tokens';
import {
  login,
  logout,
  validateSession,
  InvalidCredentialsError,
  TooManyAttemptsError,
  MAX_CONCURRENT_SESSIONS_PER_COMPANY,
} from '../src/company-session';

const TEST_PASSWORD = 'correct-horse-battery-staple';
let companyId: string;
let userId: string;
let userEmail: string;

beforeEach(async () => {
  const company = await db.company.create({
    data: {
      name: 'Test Co',
      address: 'Test address',
      phone: '+216 00 000 000',
      email: 'test@example.com',
      legalRepFullName: 'Test Rep',
      anmeCode: 'TEST-0001',
      anmeCategory: 'BT',
      anmeValidFrom: new Date('2024-01-01'),
      anmeValidTo: new Date('2030-01-01'),
    },
  });
  companyId = company.id;
  userEmail = `user-${company.id}@example.com`;
  const user = await db.companyUser.create({
    data: {
      companyId,
      email: userEmail,
      passwordHash: await hashPassword(TEST_PASSWORD),
      fullName: 'Test User',
      role: 'OWNER',
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await db.session.deleteMany({ where: { companyUser: { companyId } } });
  await db.companyUser.deleteMany({ where: { companyId } });
  await db.company.delete({ where: { id: companyId } });
});

describe('login', () => {
  it('succeeds with correct credentials and creates a matching Session row', async () => {
    const result = await login(userEmail, TEST_PASSWORD);
    expect(result.user.id).toBe(userId);
    const sessionRow = await db.session.findUnique({ where: { tokenHash: hashToken(result.token) } });
    expect(sessionRow).not.toBeNull();
    expect(sessionRow?.companyUserId).toBe(userId);
  });

  it('throws InvalidCredentialsError for an unknown email', async () => {
    await expect(login('nobody@example.com', TEST_PASSWORD)).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for a wrong password on a known email', async () => {
    await expect(login(userEmail, 'wrong-password')).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws an identical error message for unknown-email and wrong-password (no credential-existence leak)', async () => {
    let unknownEmailMessage = '';
    let wrongPasswordMessage = '';
    try {
      await login('nobody@example.com', TEST_PASSWORD);
    } catch (e) {
      unknownEmailMessage = (e as Error).message;
    }
    try {
      await login(userEmail, 'wrong-password');
    } catch (e) {
      wrongPasswordMessage = (e as Error).message;
    }
    expect(unknownEmailMessage).toBe(wrongPasswordMessage);
    expect(unknownEmailMessage).not.toBe('');
  });

  it('takes roughly the same time for an unknown email as for a wrong password (no timing side-channel)', async () => {
    // The identical-message test above does not prove the two paths are indistinguishable —
    // bcrypt.compare() is deliberately slow, so if the unknown-email path skipped it (as an
    // earlier version did), an attacker could reliably tell the two cases apart by response
    // TIME alone even with identical error messages. This measures that directly.
    const timeUnknownEmail = async (): Promise<number> => {
      const start = performance.now();
      try {
        await login(`definitely-not-registered-${Date.now()}@example.com`, TEST_PASSWORD);
      } catch {
        // expected
      }
      return performance.now() - start;
    };
    const timeWrongPassword = async (): Promise<number> => {
      const start = performance.now();
      try {
        await login(userEmail, 'wrong-password');
      } catch {
        // expected
      }
      return performance.now() - start;
    };

    // Average a few samples each way to reduce noise; both paths must do one DB lookup plus
    // one bcrypt.compare() at the same cost factor, so they should land in the same ballpark.
    const unknownTimes = [await timeUnknownEmail(), await timeUnknownEmail(), await timeUnknownEmail()];
    const wrongPasswordTimes = [await timeWrongPassword(), await timeWrongPassword(), await timeWrongPassword()];
    const avg = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / arr.length;
    const unknownAvg = avg(unknownTimes);
    const wrongPasswordAvg = avg(wrongPasswordTimes);

    // Generous tolerance (2x) since this runs against a real network-connected database with
    // naturally variable latency — the point is to catch an order-of-magnitude gap (e.g. one
    // path skipping bcrypt entirely), not to assert near-exact timing equality.
    expect(unknownAvg).toBeLessThan(wrongPasswordAvg * 2);
    expect(wrongPasswordAvg).toBeLessThan(unknownAvg * 2);
  });

  it('evicts exactly the oldest session when already at the cap (boundary case, not cap-1 or cap+1)', async () => {
    const seededTokens: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS_PER_COMPANY; i++) {
      const token = `seed-token-${i}`;
      await db.session.create({
        data: {
          companyUserId: userId,
          tokenHash: hashToken(token),
          createdAt: new Date(Date.now() - (MAX_CONCURRENT_SESSIONS_PER_COMPANY - i) * 1000),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      seededTokens.push(token);
    }

    await login(userEmail, TEST_PASSWORD);

    const remaining = await db.session.count({ where: { companyUser: { companyId } } });
    expect(remaining).toBe(MAX_CONCURRENT_SESSIONS_PER_COMPANY);

    const oldestStillExists = await db.session.findUnique({ where: { tokenHash: hashToken(seededTokens[0]!) } });
    expect(oldestStillExists).toBeNull();
    const secondOldestStillExists = await db.session.findUnique({ where: { tokenHash: hashToken(seededTokens[1]!) } });
    expect(secondOldestStillExists).not.toBeNull();
  });

  it('does not evict any session when below the cap', async () => {
    const token = 'seed-token-below-cap';
    await db.session.create({
      data: { companyUserId: userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) },
    });

    await login(userEmail, TEST_PASSWORD);

    const stillExists = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(stillExists).not.toBeNull();
  });

  it('throws TooManyAttemptsError after repeated failures, and does not lock a different email', async () => {
    for (let i = 0; i < 10; i++) {
      try {
        await login(userEmail, 'wrong-password');
      } catch {
        // expected InvalidCredentialsError on early attempts; ignore until the limiter kicks in
      }
    }
    await expect(login(userEmail, TEST_PASSWORD)).rejects.toThrow(TooManyAttemptsError);

    // A different email must be unaffected by userEmail's lockout.
    const otherEmail = `other-${companyId}@example.com`;
    await db.companyUser.create({
      data: { companyId, email: otherEmail, passwordHash: await hashPassword(TEST_PASSWORD), fullName: 'Other User', role: 'MEMBER' },
    });
    await expect(login(otherEmail, TEST_PASSWORD)).resolves.toBeDefined();
  });
});

describe('validateSession', () => {
  it('resolves a valid token to the right user and updates lastSeenAt', async () => {
    const { token } = await login(userEmail, TEST_PASSWORD);
    const before = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
    const resolved = await validateSession(token);
    expect(resolved?.id).toBe(userId);
    const after = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(after!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before!.lastSeenAt.getTime());
  });

  it('returns null for a token matching no session', async () => {
    expect(await validateSession('nonexistent-token')).toBeNull();
  });

  it('returns null for an expired session, not just a missing one', async () => {
    const expiredToken = 'expired-token';
    await db.session.create({
      data: { companyUserId: userId, tokenHash: hashToken(expiredToken), expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateSession(expiredToken)).toBeNull();
  });
});

describe('logout', () => {
  it('deletes the matching session so validateSession no longer resolves it', async () => {
    const { token } = await login(userEmail, TEST_PASSWORD);
    await logout(token);
    expect(await validateSession(token)).toBeNull();
  });

  it('does not throw for a token matching no session', async () => {
    await expect(logout('nonexistent-token')).resolves.toBeUndefined();
  });
});
