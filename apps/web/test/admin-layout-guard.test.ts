import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockCookies, mockRedirect, mockValidateSuperAdminSession } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: mockValidateSuperAdminSession };
});

import { requireAuthenticatedSuperAdmin } from '../app/admin/(protected)/layout';

beforeEach(() => {
  mockGet.mockReset();
  mockRedirect.mockClear();
  mockValidateSuperAdminSession.mockClear();
});

describe('requireAuthenticatedSuperAdmin', () => {
  it('redirects to /admin/login when no session cookie is present', async () => {
    mockGet.mockReturnValue(undefined);

    await requireAuthenticatedSuperAdmin();

    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
    expect(mockValidateSuperAdminSession).not.toHaveBeenCalled();
  });

  it('redirects to /admin/login when the cookie is present but validateSuperAdminSession returns null', async () => {
    mockGet.mockReturnValue({ value: 'expired-or-unknown-token' });
    mockValidateSuperAdminSession.mockResolvedValue(null);

    await requireAuthenticatedSuperAdmin();

    expect(mockValidateSuperAdminSession).toHaveBeenCalledWith('expired-or-unknown-token');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('returns the authenticated admin and does not redirect when the session is valid', async () => {
    const admin = { id: '1', email: 'admin@dossipv.tn' };
    mockGet.mockReturnValue({ value: 'valid-token' });
    mockValidateSuperAdminSession.mockResolvedValue(admin);

    const result = await requireAuthenticatedSuperAdmin();

    expect(result).toEqual(admin);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
