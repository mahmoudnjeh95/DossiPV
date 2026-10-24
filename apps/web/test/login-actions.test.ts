import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSet, mockCookies, mockRedirect, mockLogin, mockCompanyFind } = vi.hoisted(() => {
  const mockSet = vi.fn();
  return {
    mockSet,
    mockCookies: vi.fn(() => Promise.resolve({ set: mockSet })),
    mockRedirect: vi.fn(),
    mockLogin: vi.fn(),
    mockCompanyFind: vi.fn(),
  };
});

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: (): Promise<{ get: () => string }> => Promise.resolve({ get: () => 'http' }),
}));
vi.mock('@dossipv/db', () => ({ db: { company: { findUnique: mockCompanyFind } } }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, login: mockLogin };
});

import { loginAction } from '../app/login/actions';
import { EmailNotVerifiedError, InvalidCredentialsError, TooManyAttemptsError } from '@dossipv/auth';

beforeEach(() => {
  mockSet.mockClear();
  mockRedirect.mockClear();
  mockLogin.mockClear();
  mockCompanyFind.mockReset();
  mockCompanyFind.mockResolvedValue({ kind: 'INSTALLER' });
});

describe('loginAction', () => {
  it('sends a supplier company to /fournisseur', async () => {
    mockLogin.mockResolvedValue({ user: { id: '1', companyId: 'c1', email: 'a@b.com', fullName: 'A', role: 'OWNER' }, token: 'raw-token' });
    mockCompanyFind.mockResolvedValue({ kind: 'SUPPLIER' });
    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'correct-password');

    await loginAction(undefined, formData);

    expect(mockCompanyFind).toHaveBeenCalledWith({ where: { id: 'c1' }, select: { kind: true } });
    expect(mockRedirect).toHaveBeenCalledWith('/fournisseur');
  });

  it('sets the session cookie and redirects to /dashboard on success', async () => {
    mockLogin.mockResolvedValue({ user: { id: '1', companyId: 'c1', email: 'a@b.com', fullName: 'A', role: 'OWNER' }, token: 'raw-token' });

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'correct-password');

    await loginAction(undefined, formData);

    expect(mockSet).toHaveBeenCalledWith('dossipv_session', 'raw-token', expect.objectContaining({ httpOnly: true }));
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('returns a French error and does not redirect on InvalidCredentialsError', async () => {
    mockLogin.mockRejectedValue(new InvalidCredentialsError());

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'wrong-password');

    const result = await loginAction(undefined, formData);

    expect(result).toEqual({ error: 'Email ou mot de passe incorrect.' });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns a French error and does not redirect on TooManyAttemptsError', async () => {
    mockLogin.mockRejectedValue(new TooManyAttemptsError());

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'wrong-password');

    const result = await loginAction(undefined, formData);

    expect(result).toEqual({ error: 'Trop de tentatives échouées. Réessayez plus tard.' });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('never echoes the submitted password back in the error result', async () => {
    mockLogin.mockRejectedValue(new InvalidCredentialsError());

    const formData = new FormData();
    formData.set('email', 'a@b.com');
    formData.set('password', 'super-secret-password-value');

    const result = await loginAction(undefined, formData);

    expect(JSON.stringify(result)).not.toContain('super-secret-password-value');
  });

  it('treats a non-string email field (e.g. a submitted File) as invalid rather than stringifying it', async () => {
    const formData = new FormData();
    formData.set('email', new Blob(['x']), 'not-an-email.txt');
    formData.set('password', 'any-password');

    const result = await loginAction(undefined, formData);

    expect(mockLogin).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Email ou mot de passe incorrect.' });
  });

  it('offers to resend the confirmation email when the address is not confirmed', async () => {
    mockLogin.mockRejectedValue(new EmailNotVerifiedError());
    const formData = new FormData();
    formData.set('email', ' Ali@Solaire.TN ');
    formData.set('password', 'correct-password');

    const result = await loginAction(undefined, formData);

    expect(result).toMatchObject({ unverifiedEmail: 'ali@solaire.tn' });
    expect(result?.error).toContain('Confirmez votre adresse email');
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
