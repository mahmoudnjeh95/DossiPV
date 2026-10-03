import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockDelete, mockCookies, mockRedirect, mockLogoutSuperAdmin } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockDelete = vi.fn();
  return {
    mockGet,
    mockDelete,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet, delete: mockDelete })),
    mockRedirect: vi.fn(),
    mockLogoutSuperAdmin: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, logoutSuperAdmin: mockLogoutSuperAdmin };
});

import { logoutAdminAction } from '../app/admin/(protected)/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockClear();
  mockRedirect.mockClear();
  mockLogoutSuperAdmin.mockClear();
});

describe('logoutAdminAction', () => {
  it('calls logoutSuperAdmin() with the cookie token, clears the cookie, and redirects to /admin/login', async () => {
    mockGet.mockReturnValue({ value: 'a-real-admin-token' });
    mockLogoutSuperAdmin.mockResolvedValue(undefined);

    await logoutAdminAction();

    expect(mockLogoutSuperAdmin).toHaveBeenCalledWith('a-real-admin-token');
    expect(mockDelete).toHaveBeenCalledWith('dossipv_admin_session');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('still clears the cookie and redirects even when there is no cookie to begin with', async () => {
    mockGet.mockReturnValue(undefined);

    await logoutAdminAction();

    expect(mockLogoutSuperAdmin).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('dossipv_admin_session');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });
});
