import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockCookies, mockRedirect, mockValidateSession } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mockValidateSession };
});

import { requireAuthenticatedCompanyUser } from '../app/(app)/layout';

beforeEach(() => {
  mockGet.mockReset();
  mockRedirect.mockClear();
  mockValidateSession.mockClear();
});

describe('requireAuthenticatedCompanyUser', () => {
  it('redirects to /login when no session cookie is present', async () => {
    mockGet.mockReturnValue(undefined);

    await requireAuthenticatedCompanyUser();

    expect(mockRedirect).toHaveBeenCalledWith('/login?connexion=requise');
    expect(mockValidateSession).not.toHaveBeenCalled();
  });

  it('redirects to /login when the cookie is present but validateSession returns null', async () => {
    mockGet.mockReturnValue({ value: 'some-expired-or-unknown-token' });
    mockValidateSession.mockResolvedValue(null);

    await requireAuthenticatedCompanyUser();

    expect(mockValidateSession).toHaveBeenCalledWith('some-expired-or-unknown-token');
    expect(mockRedirect).toHaveBeenCalledWith('/login?connexion=requise');
  });

  it('returns the authenticated user and does not redirect when the session is valid', async () => {
    const user = { id: '1', companyId: 'c1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };
    mockGet.mockReturnValue({ value: 'valid-token' });
    mockValidateSession.mockResolvedValue(user);

    const result = await requireAuthenticatedCompanyUser();

    expect(result).toEqual(user);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
