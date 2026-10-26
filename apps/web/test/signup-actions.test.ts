import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailMessage } from '@dossipv/email';

const m = vi.hoisted(() => ({
  clientIp: '10.0.0.1',
  adminEmail: null as string | null,
  emailConfigured: true,
  afterCallbacks: [] as Array<() => Promise<void>>,
  mockUserFindFirst: vi.fn(),
  mockCompanyFindMany: vi.fn(),
  mockCompanyCreate: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(),
  mockUserCreate: vi.fn(),
  mockCreateToken: vi.fn(),
  mockSendEmail: vi.fn<(message: EmailMessage) => Promise<{ sent: boolean }>>(),
}));

vi.mock('next/headers', () => ({
  headers: (): Promise<{ get: (name: string) => string | null }> =>
    Promise.resolve({ get: (name: string) => (name === 'x-real-ip' ? m.clientIp : null) }),
}));
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>): void => {
    m.afterCallbacks.push(callback);
  },
}));
vi.mock('@dossipv/db', () => ({
  db: {
    companyUser: { findFirst: m.mockUserFindFirst },
    company: { findMany: m.mockCompanyFindMany },
    $transaction: (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
      callback({ company: { create: m.mockCompanyCreate }, companyUser: { create: m.mockUserCreate } }),
  },
}));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, createEmailVerificationToken: m.mockCreateToken, hashPassword: vi.fn().mockResolvedValue('hashed') };
});
vi.mock('@dossipv/email', () => ({
  sendEmail: m.mockSendEmail,
  appUrl: (path: string): string => `https://dossipv.tn${path}`,
  adminEmailAddress: (): string | null => m.adminEmail,
  isEmailConfigured: (): boolean => m.emailConfigured,
}));

import { resendVerificationAction, signUpAction } from '../app/inscription/actions';
import { TERMS_VERSION } from '../lib/legal';

// expect.* matchers are typed any; these keep the assertions lint-clean.
const contains = (text: string): string => expect.stringContaining(text) as string;
const anyDate = (): Date => expect.any(Date) as Date;
const objectWith = (value: Record<string, unknown>): Record<string, unknown> => expect.objectContaining(value) as Record<string, unknown>;

let ipCounter = 0;
let emailCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  m.afterCallbacks.length = 0;
  m.adminEmail = null;
  m.emailConfigured = true;
  // The limiters live in the module: each test starts from a fresh client address and mailbox.
  ipCounter += 1;
  emailCounter += 1;
  m.clientIp = `10.1.0.${ipCounter}`;
  m.mockUserFindFirst.mockResolvedValue(null);
  m.mockCompanyFindMany.mockResolvedValue([]);
  m.mockCompanyCreate.mockResolvedValue({ id: 'c1' });
  m.mockUserCreate.mockResolvedValue({ id: 'u1' });
  m.mockCreateToken.mockResolvedValue('raw+token/=');
  m.mockSendEmail.mockResolvedValue({ sent: true });
});

function freshEmail(): string {
  return `installateur${emailCounter}@solaire.tn`;
}

function signUpForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    companyName: 'Solaire Sfax',
    contactName: 'Ali Ben Salah',
    phone: '+216 20 000 000',
    email: freshEmail(),
    governorate: 'Sfax',
    anmeCode: ' inst-0042 ',
    password: 'un-mot-de-passe-long',
    confirmation: 'un-mot-de-passe-long',
    acceptTerms: 'on',
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

async function signUp(overrides: Record<string, string> = {}): Promise<Awaited<ReturnType<typeof signUpAction>>> {
  const result = await signUpAction(undefined, signUpForm(overrides));
  for (const callback of m.afterCallbacks.splice(0)) await callback();
  return result;
}

describe('signUpAction validation', () => {
  it.each([
    [{ companyName: '' }, 'Raison sociale'],
    [{ contactName: '' }, 'Nom et prénom'],
    [{ phone: '' }, 'Téléphone'],
    [{ phone: 'abc' }, 'numéro tunisien invalide'],
    [{ phone: '1234567' }, 'numéro tunisien invalide'],
    [{ phone: '+33 6 12 34 56 78' }, 'numéro tunisien invalide'],
    [{ email: 'pas-un-email' }, 'adresse invalide'],
    [{ governorate: 'Atlantide' }, 'Gouvernorat'],
    [{ governorate: '' }, 'Gouvernorat'],
    [{ anmeCode: '' }, 'Code ANME'],
    [{ anmeCode: 'AB' }, 'Code ANME'],
    [{ anmeCode: 'AB#12' }, 'Code ANME'],
    [{ password: 'court', confirmation: 'court' }, '10 caractères minimum'],
    [{ password: 'x'.repeat(73), confirmation: 'x'.repeat(73) }, '72 caractères maximum'],
    [{ confirmation: 'autre-mot-de-passe' }, 'ne correspondent pas'],
    [{ acceptTerms: '' }, 'conditions générales'],
  ])('refuses %j', async (overrides, message) => {
    const result = await signUp(overrides);

    expect(result.sent).toBe(false);
    expect(result).toMatchObject({ error: contains(message) });
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('gives the typed values back, without the password', async () => {
    const result = await signUp({ phone: '' });

    expect(result).toMatchObject({ sent: false, fields: { companyName: 'Solaire Sfax', anmeCode: 'INST-0042' } });
    expect(JSON.stringify(result)).not.toContain('un-mot-de-passe-long');
  });
});

describe('signUpAction', () => {
  it('creates the company (placeholders, incomplete profile) and its owner without a subscription, then emails the link', async () => {
    const email = freshEmail();
    const result = await signUp({ email: email.toUpperCase() });

    expect(result).toEqual({ sent: true, email });
    expect(m.mockCompanyCreate).toHaveBeenCalledWith({
      data: objectWith({
        name: 'Solaire Sfax',
        phone: '+216 20 000 000',
        email,
        address: '',
        legalRepFullName: 'Ali Ben Salah',
        anmeCode: 'INST-0042',
        anmeCategory: 'BT',
        anmeValidFrom: new Date('2000-01-01T00:00:00.000Z'),
        anmeValidTo: new Date('2000-01-01T00:00:00.000Z'),
        profileComplete: false,
        signupAt: anyDate(),
        signupContactName: 'Ali Ben Salah',
        signupGovernorate: 'Sfax',
      }),
    });
    expect(m.mockCompanyCreate.mock.calls[0]?.[0].data).not.toHaveProperty('subscription');
    expect(m.mockUserCreate).toHaveBeenCalledWith({
      data: {
        companyId: 'c1',
        email,
        fullName: 'Ali Ben Salah',
        role: 'OWNER',
        passwordHash: 'hashed',
        termsAcceptedAt: anyDate(),
        termsVersion: TERMS_VERSION,
      },
    });
    expect(m.mockCreateToken).toHaveBeenCalledWith('u1');
    expect(m.mockSendEmail).toHaveBeenCalledTimes(1);
    const message = m.mockSendEmail.mock.calls[0]?.[0];
    expect(message?.to).toBe(email);
    expect(message?.action?.url).toBe('https://dossipv.tn/verifier-email?token=raw%2Btoken%2F%3D');
    expect(message?.text).toContain('48 heures');
  });

  it.each(['inst-0042', 'INST 0042', 'Inst0042', ' inst  -0042'])('refuses an ANME code already registered (%s)', async (typed) => {
    m.mockCompanyFindMany.mockResolvedValue([{ anmeCode: 'INST-0042' }]);

    const result = await signUp({ anmeCode: typed });

    expect(result).toMatchObject({ sent: false, error: 'Ce code ANME est déjà inscrit, contactez-nous.' });
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('adds the admin address to the ANME refusal when it is set', async () => {
    m.adminEmail = 'contact@dossipv.tn';
    m.mockCompanyFindMany.mockResolvedValue([{ anmeCode: 'INST-0042' }]);

    const result = await signUp();

    expect(result).toMatchObject({ error: contains('contact@dossipv.tn') });
  });

  it('answers an address already in use like a success and tells its owner by email', async () => {
    m.mockUserFindFirst.mockResolvedValue({ id: 'u9' });
    const email = freshEmail();

    const result = await signUp({ email });

    expect(result).toEqual({ sent: true, email });
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
    expect(m.mockCreateToken).not.toHaveBeenCalled();
    expect(m.mockSendEmail).toHaveBeenCalledTimes(1);
    const message = m.mockSendEmail.mock.calls[0]?.[0];
    expect(message?.to).toBe(email);
    expect(message?.text).toContain('un compte existe déjà');
    expect(message?.action?.url).toBe('https://dossipv.tn/login');
  });

  it('gives the neutral answer when a parallel sign-up took the address first', async () => {
    m.mockCompanyCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    const result = await signUp();

    expect(result.sent).toBe(true);
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('limits a client to 5 sign-ups per hour', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      emailCounter += 1;
      expect((await signUp()).sent).toBe(true);
    }
    emailCounter += 1;
    const limited = await signUp();

    expect(limited).toMatchObject({ sent: false, error: contains('Trop de demandes') });
    expect(m.mockCompanyCreate).toHaveBeenCalledTimes(5);
  });

  it('limits an address to 5 sign-ups per hour, whatever the client', async () => {
    const email = freshEmail();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      ipCounter += 1;
      m.clientIp = `10.2.0.${ipCounter}`;
      expect((await signUp({ email })).sent).toBe(true);
    }
    ipCounter += 1;
    m.clientIp = `10.2.0.${ipCounter}`;

    expect(await signUp({ email })).toMatchObject({ sent: false, error: contains('Trop de demandes') });
  });
});

describe('resendVerificationAction', () => {
  function resend(email: string): Promise<Awaited<ReturnType<typeof resendVerificationAction>>> {
    const formData = new FormData();
    formData.set('email', email);
    return resendVerificationAction(undefined, formData).then(async (result) => {
      for (const callback of m.afterCallbacks.splice(0)) await callback();
      return result;
    });
  }

  it('sends a new link to an unverified self sign-up', async () => {
    m.mockUserFindFirst.mockResolvedValue({ id: 'u1', email: 'ali@solaire.tn', fullName: 'Ali' });

    const result = await resend(' Ali@Solaire.TN ');

    expect(result.sent).toBe(true);
    expect(m.mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: objectWith({ email: { equals: 'ali@solaire.tn', mode: 'insensitive' }, disabledAt: null, OR: [{ emailVerifiedAt: null }, { company: { subscription: null } }], company: { signupAt: { not: null } } }),
      }),
    );
    expect(m.mockCreateToken).toHaveBeenCalledWith('u1');
    expect(m.mockSendEmail.mock.calls[0]?.[0].action?.url).toContain('/verifier-email?token=');
  });

  it('gives the same answer, and sends nothing, when no such pending account exists', async () => {
    m.mockUserFindFirst.mockResolvedValueOnce({ id: 'u1', email: 'a@b.tn', fullName: 'A' });
    const known = await resend('a@b.tn');
    m.mockSendEmail.mockClear();
    m.mockUserFindFirst.mockResolvedValueOnce(null);

    const unknown = await resend('inconnu@b.tn');

    expect(unknown).toEqual(known);
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('refuses an empty address', async () => {
    expect(await resend('  ')).toEqual({ sent: false, error: 'Saisissez votre adresse e-mail.' });
  });

  it('limits an address to 5 requests per hour', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      ipCounter += 1;
      m.clientIp = `10.3.0.${ipCounter}`;
      expect((await resend('limite@solaire.tn')).sent).toBe(true);
    }
    ipCounter += 1;
    m.clientIp = `10.3.0.${ipCounter}`;

    expect(await resend('limite@solaire.tn')).toMatchObject({ sent: false, error: contains('Trop de demandes') });
  });

  it('limits a client to 5 requests per hour', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await resend(`client${attempt}@solaire.tn`)).sent).toBe(true);
    }

    expect(await resend('client9@solaire.tn')).toMatchObject({ sent: false, error: contains('Trop de demandes') });
  });
});

describe('the confirmation link in development', () => {
  it('is returned (and logged) only without SMTP and outside production', async () => {
    m.emailConfigured = false;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await signUp();

    expect(result).toMatchObject({ sent: true, devVerifyUrl: contains('/verifier-email?token=raw%2Btoken%2F%3D') });
    expect(warn).toHaveBeenCalledWith(contains('[dev] confirmation link'));
    // The email still goes out, with the very same link (one token only).
    expect(m.mockCreateToken).toHaveBeenCalledTimes(1);
    expect(m.mockSendEmail.mock.calls[0]?.[0].action?.url).toContain('raw%2Btoken');
    warn.mockRestore();
  });

  it('is never returned when SMTP is configured', async () => {
    const result = await signUp();

    expect(result).not.toHaveProperty('devVerifyUrl');
  });

  it('is never returned in production, even without SMTP', async () => {
    m.emailConfigured = false;
    vi.stubEnv('NODE_ENV', 'production');

    const result = await signUp();
    vi.unstubAllEnvs();

    expect(JSON.stringify(result)).not.toContain('verifier-email');
    expect(result).not.toHaveProperty('devVerifyUrl');
  });

  it('is returned by the resend action too, outside production without SMTP', async () => {
    m.emailConfigured = false;
    m.mockUserFindFirst.mockResolvedValue({ id: 'u1', email: 'ali@solaire.tn', fullName: 'Ali' });
    const formData = new FormData();
    formData.set('email', 'ali@solaire.tn');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await resendVerificationAction(undefined, formData);
    warn.mockRestore();

    expect(result).toMatchObject({ sent: true, devVerifyUrl: contains('/verifier-email?token=') });
  });
});
