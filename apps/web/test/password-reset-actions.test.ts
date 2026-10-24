import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailMessage } from '@dossipv/email';

const m = vi.hoisted(() => ({
  clientIp: '10.0.0.1',
  afterCallbacks: [] as Array<() => Promise<void>>,
  mockFindFirst: vi.fn(),
  mockCreateToken: vi.fn(),
  mockResetPassword: vi.fn(),
  mockSendEmail: vi.fn<(message: EmailMessage) => Promise<{ sent: boolean; reason?: string }>>(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  headers: (): Promise<{ get: (name: string) => string | null }> =>
    Promise.resolve({ get: (name: string) => (name === 'x-real-ip' ? m.clientIp : null) }),
}));
// after() runs once the response is sent; the tests collect the callbacks and run them by hand.
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>): void => {
    m.afterCallbacks.push(callback);
  },
}));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/db', () => ({ db: { companyUser: { findFirst: m.mockFindFirst } } }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, createPasswordResetToken: m.mockCreateToken, resetPasswordWithToken: m.mockResetPassword };
});
vi.mock('@dossipv/email', () => ({
  sendEmail: m.mockSendEmail,
  appUrl: (path: string): string => `https://dossipv.tn${path}`,
}));

import { requestPasswordResetAction } from '../app/mot-de-passe-oublie/actions';
import { resetPasswordAction } from '../app/reinitialiser-mot-de-passe/actions';
import { InvalidResetTokenError, WeakPasswordError } from '@dossipv/auth';

const CONFIRMATION = {
  sent: true,
  message: "Si un compte existe pour cette adresse, un email avec un lien vient d'être envoyé. Pensez à vérifier vos courriers indésirables.",
};

let ipCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  m.afterCallbacks.length = 0;
  // The limiters live in the module: each test starts from a fresh client address.
  ipCounter += 1;
  m.clientIp = `10.0.0.${ipCounter}`;
  m.mockCreateToken.mockResolvedValue('raw-token+/=');
  m.mockSendEmail.mockResolvedValue({ sent: true });
});

function emailForm(email: string): FormData {
  const formData = new FormData();
  formData.set('email', email);
  return formData;
}

async function requestAndFlush(email: string): Promise<Awaited<ReturnType<typeof requestPasswordResetAction>>> {
  const result = await requestPasswordResetAction(undefined, emailForm(email));
  for (const callback of m.afterCallbacks.splice(0)) await callback();
  return result;
}

describe('requestPasswordResetAction', () => {
  it('emails a reset link to an enabled account and answers with the neutral confirmation', async () => {
    m.mockFindFirst.mockResolvedValue({ id: 'u1', email: 'ali@solaire.tn', disabledAt: null });

    const result = await requestAndFlush('  Ali@Solaire.TN ');

    expect(result).toEqual(CONFIRMATION);
    expect(m.mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'ali@solaire.tn', mode: 'insensitive' } } }),
    );
    expect(m.mockCreateToken).toHaveBeenCalledWith('u1');
    expect(m.mockSendEmail).toHaveBeenCalledTimes(1);
    const message = m.mockSendEmail.mock.calls[0]![0];
    expect(message.to).toBe('ali@solaire.tn');
    expect(message.text).toContain('1 heure');
    expect(message.action?.url).toBe('https://dossipv.tn/reinitialiser-mot-de-passe?token=raw-token%2B%2F%3D');
  });

  it('gives the same answer and sends nothing for an unknown address', async () => {
    m.mockFindFirst.mockResolvedValue(null);

    const result = await requestAndFlush('personne@exemple.tn');

    expect(result).toEqual(CONFIRMATION);
    expect(m.mockCreateToken).not.toHaveBeenCalled();
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('gives the same answer and sends nothing for a disabled account', async () => {
    m.mockFindFirst.mockResolvedValue({ id: 'u2', email: 'off@solaire.tn', disabledAt: new Date() });

    const result = await requestAndFlush('off@solaire.tn');

    expect(result).toEqual(CONFIRMATION);
    expect(m.mockCreateToken).not.toHaveBeenCalled();
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('still answers with the confirmation when the email could not be sent', async () => {
    m.mockFindFirst.mockResolvedValue({ id: 'u3', email: 'smtp@solaire.tn', disabledAt: null });
    m.mockSendEmail.mockResolvedValue({ sent: false, reason: 'SMTP is not configured' });

    expect(await requestAndFlush('smtp@solaire.tn')).toEqual(CONFIRMATION);
  });

  it('asks for an address when the field is empty', async () => {
    const result = await requestPasswordResetAction(undefined, emailForm('   '));

    expect(result).toEqual({ sent: false, error: 'Saisissez votre adresse e-mail.' });
    expect(m.mockFindFirst).not.toHaveBeenCalled();
  });

  it('limits requests for one address to 5 per window, whatever the client', async () => {
    m.mockFindFirst.mockResolvedValue({ id: 'u4', email: 'flood@solaire.tn', disabledAt: null });

    for (let i = 0; i < 5; i += 1) {
      m.clientIp = `10.1.0.${i}`;
      expect(await requestAndFlush('flood@solaire.tn')).toEqual(CONFIRMATION);
    }
    m.clientIp = '10.1.0.99';
    const limited = await requestAndFlush('flood@solaire.tn');

    expect(limited).toEqual({ sent: false, error: 'Trop de demandes. Réessayez dans quelques minutes.' });
    expect(m.mockSendEmail).toHaveBeenCalledTimes(5);
  });

  it('limits one client sweeping through many addresses', async () => {
    m.mockFindFirst.mockResolvedValue(null);

    for (let i = 0; i < 20; i += 1) {
      expect(await requestAndFlush(`sweep${i}@exemple.tn`)).toEqual(CONFIRMATION);
    }
    const limited = await requestAndFlush('sweep-last@exemple.tn');

    expect(limited).toEqual({ sent: false, error: 'Trop de demandes. Réessayez dans quelques minutes.' });
    expect(m.mockFindFirst).toHaveBeenCalledTimes(20);
  });
});

function resetForm(fields: { token?: string; password?: string; confirmation?: string }): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe('resetPasswordAction', () => {
  it('changes the password and redirects to the login page with the success notice', async () => {
    m.mockResetPassword.mockResolvedValue({ companyUserId: 'u1' });

    await expect(
      resetPasswordAction(undefined, resetForm({ token: 'tok', password: 'nouveau-mdp', confirmation: 'nouveau-mdp' })),
    ).rejects.toThrow('NEXT_REDIRECT:/login?reinitialise=1');

    expect(m.mockResetPassword).toHaveBeenCalledWith('tok', 'nouveau-mdp');
  });

  it('refuses two different passwords without touching the account', async () => {
    const result = await resetPasswordAction(undefined, resetForm({ token: 'tok', password: 'nouveau-mdp', confirmation: 'autre-mdp1' }));

    expect(result).toEqual({ error: 'Les deux mots de passe ne correspondent pas.' });
    expect(m.mockResetPassword).not.toHaveBeenCalled();
  });

  it('refuses a password shorter than 8 characters', async () => {
    const result = await resetPasswordAction(undefined, resetForm({ token: 'tok', password: 'court', confirmation: 'court' }));

    expect(result).toEqual({ error: 'Le mot de passe doit comporter au moins 8 caractères.' });
    expect(m.mockResetPassword).not.toHaveBeenCalled();
  });

  it('maps WeakPasswordError to the French length message', async () => {
    m.mockResetPassword.mockRejectedValue(new WeakPasswordError());

    const result = await resetPasswordAction(undefined, resetForm({ token: 'tok', password: 'nouveau-mdp', confirmation: 'nouveau-mdp' }));

    expect(result).toEqual({ error: 'Le mot de passe doit comporter au moins 8 caractères.' });
  });

  it('explains that a used, expired or unknown link is no longer valid', async () => {
    m.mockResetPassword.mockRejectedValue(new InvalidResetTokenError());

    const result = await resetPasswordAction(undefined, resetForm({ token: 'old', password: 'nouveau-mdp', confirmation: 'nouveau-mdp' }));

    expect(result).toEqual({ error: 'Ce lien n’est plus valide. Demandez un nouveau lien depuis « Mot de passe oublié ».' });
    expect(m.mockRedirect).not.toHaveBeenCalled();
  });

  it('treats a missing token as an invalid link', async () => {
    const result = await resetPasswordAction(undefined, resetForm({ password: 'nouveau-mdp', confirmation: 'nouveau-mdp' }));

    expect(result?.error).toMatch(/plus valide/);
    expect(m.mockResetPassword).not.toHaveBeenCalled();
  });
});
