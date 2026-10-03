import { describe, it, expect } from 'vitest';
import { generateToken, hashToken } from '../src/tokens';

describe('generateToken', () => {
  it('produces a 64-character hex string (32 random bytes)', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different token on each call', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('hashToken', () => {
  it('produces the same hash for the same input (deterministic)', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it('produces a 64-character hex string (sha256 digest)', () => {
    expect(hashToken(generateToken())).toMatch(/^[0-9a-f]{64}$/);
  });
});
