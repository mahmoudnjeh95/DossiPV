import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('next/headers', () => ({ headers: (): Promise<{ get: typeof mockGet }> => Promise.resolve({ get: mockGet }) }));

import { shouldUseSecureCookie } from '../lib/cookie-secure';

beforeEach(() => mockGet.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe('shouldUseSecureCookie', () => {
  it('is false for a plain-HTTP request even in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGet.mockReturnValue('http');
    expect(await shouldUseSecureCookie()).toBe(false);
  });

  it('is true for an HTTPS request', async () => {
    mockGet.mockReturnValue('https');
    expect(await shouldUseSecureCookie()).toBe(true);
  });

  it('uses the first value of a multi-proxy header', async () => {
    mockGet.mockReturnValue('https, http');
    expect(await shouldUseSecureCookie()).toBe(true);
  });

  it('falls back to Secure in production when the header is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockGet.mockReturnValue(null);
    expect(await shouldUseSecureCookie()).toBe(true);
  });

  it('falls back to non-Secure outside production when the header is missing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockGet.mockReturnValue(null);
    expect(await shouldUseSecureCookie()).toBe(false);
  });
});
