import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSet, mockCookies, mockRedirect, mockLoginSuperAdmin } = vi.hoisted(() => {
  const mockSet = vi.fn();
  return {
    mockSet,
    mockCookies: vi.fn(() => Promise.resolve({ set: mockSet })),
    mockRedirect: vi.fn(),
    mockLoginSuperAdmin: vi.fn(),
  };
});

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: (): Promise<{ get: () => string }> => Promise.resolve({ get: () => 'http' }),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, loginSuperAdmin: mockLoginSuperAdmin };
});

import { loginAdminAction } from '../app/admin/login/actions';
import { InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

beforeEach(() => {
  mockSet.mockClear();
  mockRedirect.mockClear();
  mockLoginSuperAdmin.mockClear();
});

describe('loginAdminAction', () => {
  it('sets the admin session cookie and redirects to /admin on success', async () => {
    mockLoginSuperAdmin.mockResolvedValue({ admin: { id: '1', email: 'admin@dossipv.tn' }, token: 'raw-admin-token' });

    const formData = new FormData();
    formData.set('email', 'admin@dossipv.tn');
    formData.set('password', 'correct-password');

    await loginAdminAction(undefined, formData);

    expect(mockSet).toHaveBeenCalledWith('dossipv_admin_session', 'raw-admin-token', expect.objectContaining({ httpOnly: true }));
    expect(mockRedirect).toHaveBeenCalledWith('/admin');
  });

  it('returns a French error and does not redirect on InvalidCredentialsError', async () => {
    mockLoginSuperAdmin.mockRejectedValue(new InvalidCredentialsError());

    const formData = new FormData();
    formData.set('email', 'admin@dossipv.tn');
    formData.set('password', 'wrong-password');

    const result = await loginAdminAction(undefined, formData);

    expect(result).toEqual({ error: 'Email ou mot de passe incorrect.' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('returns a French error and does not redirect on TooManyAttemptsError', async () => {
    mockLoginSuperAdmin.mockRejectedValue(new TooManyAttemptsError());

    const formData = new FormData();
    formData.set('email', 'admin@dossipv.tn');
    formData.set('password', 'wrong-password');

    const result = await loginAdminAction(undefined, formData);

    expect(result).toEqual({ error: 'Trop de tentatives échouées. Réessayez plus tard.' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('treats a non-string email field as invalid rather than stringifying it', async () => {
    const formData = new FormData();
    formData.set('email', new Blob(['x']), 'not-an-email.txt');
    formData.set('password', 'any-password');

    const result = await loginAdminAction(undefined, formData);

    expect(mockLoginSuperAdmin).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Email ou mot de passe incorrect.' });
  });
});
