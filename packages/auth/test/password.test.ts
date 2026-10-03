import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password';

describe('hashPassword / verifyPassword', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('correct-password', hash)).toBe(true);
  });

  it('rejects a wrong password against a hash', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces a different hash each time for the same password (random salt)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });
});
