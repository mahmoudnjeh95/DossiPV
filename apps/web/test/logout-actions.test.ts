import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockDelete, mockCookies, mockRedirect, mockLogout } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockDelete = vi.fn();
  return {
    mockGet,
    mockDelete,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet, delete: mockDelete })),
    mockRedirect: vi.fn(),
    mockLogout: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, logout: mockLogout };
});

import { logoutAction } from '../app/(app)/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockClear();
  mockRedirect.mockClear();
  mockLogout.mockClear();
});

describe('logoutAction', () => {
  it('calls logout() with the cookie token, clears the cookie, and redirects to /login', async () => {
    mockGet.mockReturnValue({ value: 'a-real-token' });
    mockLogout.mockResolvedValue(undefined);

    await logoutAction();

    expect(mockLogout).toHaveBeenCalledWith('a-real-token');
    expect(mockDelete).toHaveBeenCalledWith('dossipv_session');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('still clears the cookie and redirects even when there is no cookie to begin with', async () => {
    mockGet.mockReturnValue(undefined);

    await logoutAction();

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('dossipv_session');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
