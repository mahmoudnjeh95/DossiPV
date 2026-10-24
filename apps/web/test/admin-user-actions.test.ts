import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  return {
    mockGet,
    mockSet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet, set: mockSet })),
    mockRedirect: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockCreatePasswordResetToken: vi.fn(),
    mockCreateImpersonationSession: vi.fn(),
    mockSendEmail: vi.fn(),
    mockIsEmailConfigured: vi.fn(),
    mockShouldUseSecureCookie: vi.fn(),
    mockCompanyUserFindFirst: vi.fn(),
    mockCompanyUserFindUnique: vi.fn(),
    mockCompanyUserCount: vi.fn(),
    mockCompanyUserUpdate: vi.fn(),
    mockSessionDeleteMany: vi.fn(),
    mockAuditCreate: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('../lib/cookie-secure', () => ({ shouldUseSecureCookie: m.mockShouldUseSecureCookie }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return {
    ...actual,
    validateSuperAdminSession: m.mockValidateSuperAdminSession,
    createPasswordResetToken: m.mockCreatePasswordResetToken,
    createImpersonationSession: m.mockCreateImpersonationSession,
  };
});
vi.mock('@dossipv/email', () => ({
  sendEmail: m.mockSendEmail,
  isEmailConfigured: m.mockIsEmailConfigured,
  appUrl: (path: string): string => `https://app.dossipv.tn${path}`,
}));
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      companyUser: {
        findFirst: m.mockCompanyUserFindFirst,
        findUnique: m.mockCompanyUserFindUnique,
        count: m.mockCompanyUserCount,
        update: m.mockCompanyUserUpdate,
      },
      session: { deleteMany: m.mockSessionDeleteMany },
      adminAuditLog: { create: m.mockAuditCreate },
    },
  };
});

import { ACCOUNT_SETUP_LIFETIME_MS } from '@dossipv/auth';
import {
  changeCompanyUserEmailAction,
  disableCompanyUserAction,
  enableCompanyUserAction,
  impersonateCompanyUserAction,
  sendCompanyUserResetLinkAction,
} from '../app/admin/(protected)/installers/[id]/user-actions';

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

/** The AdminAuditLog rows written, as [action, targetCompanyId, details]. */
function auditEntries(): [string, string | null, unknown][] {
  return m.mockAuditCreate.mock.calls.map((call) => {
    const data = (call[0] as { data: { action: string; targetCompanyId: string | null; details?: unknown } }).data;
    return [data.action, data.targetCompanyId, data.details];
  });
}

const member = { id: 'user-2', companyId: 'company-1', email: 'membre@solar.tn', fullName: 'Salma Membre', role: 'MEMBER', disabledAt: null };
const owner = { id: 'user-1', companyId: 'company-1', email: 'owner@solar.tn', fullName: 'Ahmed Responsable', role: 'OWNER', disabledAt: null };

beforeEach(() => {
  for (const mock of Object.values(m)) {
    if (mock !== m.mockCookies) mock.mockReset();
  }
  m.mockGet.mockReturnValue({ value: 'valid-admin-token' });
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  m.mockShouldUseSecureCookie.mockResolvedValue(true);
});

describe('disableCompanyUserAction', () => {
  it("disables the user, ends its sessions and logs it", async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(member);

    await disableCompanyUserAction('company-1', 'user-2');

    expect(m.mockCompanyUserFindFirst).toHaveBeenCalledWith({ where: { id: 'user-2', companyId: 'company-1' } });
    expect(m.mockCompanyUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { disabledAt: expect.any(Date) as unknown } });
    expect(m.mockSessionDeleteMany).toHaveBeenCalledWith({ where: { companyUserId: 'user-2' } });
    expect(auditEntries()).toEqual([['user.disable', 'company-1', { userId: 'user-2', email: 'membre@solar.tn' }]]);
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/installers\/company-1\?ok=/));
  });

  it('disables an owner while another owner stays enabled', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(owner);
    m.mockCompanyUserCount.mockResolvedValue(2);

    await disableCompanyUserAction('company-1', 'user-1');

    expect(m.mockCompanyUserCount).toHaveBeenCalledWith({ where: { companyId: 'company-1', role: 'OWNER', disabledAt: null } });
    expect(m.mockCompanyUserUpdate).toHaveBeenCalled();
  });

  it('refuses disabling the last enabled owner of the company', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(owner);
    m.mockCompanyUserCount.mockResolvedValue(1);

    const result = await disableCompanyUserAction('company-1', 'user-1');

    expect(result).toEqual({ error: 'Impossible de désactiver le dernier responsable actif de la société.' });
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
    expect(m.mockSessionDeleteMany).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('refuses a user unknown to this company', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(null);

    const result = await disableCompanyUserAction('company-1', 'user-of-another-company');

    expect(result).toEqual({ error: 'Utilisateur introuvable.' });
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('enableCompanyUserAction', () => {
  it('clears disabledAt and logs it', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue({ ...member, disabledAt: new Date('2026-10-01') });

    await enableCompanyUserAction('company-1', 'user-2');

    expect(m.mockCompanyUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { disabledAt: null } });
    expect(auditEntries()).toEqual([['user.enable', 'company-1', { userId: 'user-2', email: 'membre@solar.tn' }]]);
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/installers\/company-1\?ok=/));
  });

  it('refuses a user unknown to this company', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(null);

    const result = await enableCompanyUserAction('company-1', 'nope');

    expect(result).toEqual({ error: 'Utilisateur introuvable.' });
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
  });
});

describe('changeCompanyUserEmailAction', () => {
  it('stores the trimmed, lower-cased email and logs the old and new address', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(member);
    m.mockCompanyUserFindUnique.mockResolvedValue(null);

    await changeCompanyUserEmailAction('company-1', 'user-2', undefined, form({ email: '  Salma@Solar.TN ' }));

    expect(m.mockCompanyUserFindUnique).toHaveBeenCalledWith({ where: { email: 'salma@solar.tn' } });
    expect(m.mockCompanyUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { email: 'salma@solar.tn' } });
    expect(auditEntries()).toEqual([['user.changeEmail', 'company-1', { userId: 'user-2', from: 'membre@solar.tn', to: 'salma@solar.tn' }]]);
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/installers\/company-1\?ok=/));
  });

  it('refuses an email another account signs in with', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(member);
    m.mockCompanyUserFindUnique.mockResolvedValue({ id: 'user-9' });

    const result = await changeCompanyUserEmailAction('company-1', 'user-2', undefined, form({ email: 'pris@solar.tn' }));

    expect(result).toEqual({ error: 'Cet email est déjà utilisé par un autre compte.' });
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('refuses an invalid address before looking anything up', async () => {
    const result = await changeCompanyUserEmailAction('company-1', 'user-2', undefined, form({ email: 'pas-un-email' }));

    expect(result?.error).toContain('adresse invalide');
    expect(m.mockCompanyUserFindFirst).not.toHaveBeenCalled();
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
  });

  it('refuses a user unknown to this company', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(null);

    const result = await changeCompanyUserEmailAction('company-1', 'nope', undefined, form({ email: 'a@b.tn' }));

    expect(result).toEqual({ error: 'Utilisateur introuvable.' });
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing when the address does not change', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(member);

    await changeCompanyUserEmailAction('company-1', 'user-2', undefined, form({ email: 'Membre@solar.tn' }));

    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('sendCompanyUserResetLinkAction', () => {
  beforeEach(() => {
    m.mockCompanyUserFindFirst.mockResolvedValue(member);
    m.mockCreatePasswordResetToken.mockResolvedValue('raw-token-123');
  });

  it('creates a week-long link, emails it in French and says it was sent', async () => {
    m.mockSendEmail.mockResolvedValue({ sent: true });

    const result = await sendCompanyUserResetLinkAction('company-1', 'user-2');

    expect(m.mockCreatePasswordResetToken).toHaveBeenCalledWith('user-2', ACCOUNT_SETUP_LIFETIME_MS);
    const email = m.mockSendEmail.mock.calls[0]?.[0] as { to: string; subject: string; text: string; action: { url: string } };
    expect(email.to).toBe('membre@solar.tn');
    expect(email.text).toContain('Bonjour Salma Membre');
    expect(email.action.url).toBe('https://app.dossipv.tn/reinitialiser-mot-de-passe?token=raw-token-123');
    expect(result).toEqual({ notice: 'Lien envoyé à membre@solar.tn.' });
    // The token never reaches the audit log.
    expect(auditEntries()).toEqual([['user.sendResetLink', 'company-1', { userId: 'user-2', email: 'membre@solar.tn', sent: true }]]);
    expect(JSON.stringify(m.mockAuditCreate.mock.calls)).not.toContain('raw-token-123');
  });

  it('says so when SMTP is not configured', async () => {
    m.mockSendEmail.mockResolvedValue({ sent: false, reason: 'SMTP is not configured' });
    m.mockIsEmailConfigured.mockReturnValue(false);

    const result = await sendCompanyUserResetLinkAction('company-1', 'user-2');

    expect(result?.error).toContain("n'est pas configuré");
    expect(auditEntries()[0]![2]).toEqual({ userId: 'user-2', email: 'membre@solar.tn', sent: false });
  });

  it("reports the provider's refusal", async () => {
    m.mockSendEmail.mockResolvedValue({ sent: false, reason: 'mailbox unavailable' });
    m.mockIsEmailConfigured.mockReturnValue(true);

    const result = await sendCompanyUserResetLinkAction('company-1', 'user-2');

    expect(result).toEqual({ error: 'Email non envoyé : mailbox unavailable.' });
  });

  it('refuses a disabled user and an unknown one', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValueOnce({ ...member, disabledAt: new Date('2026-10-01') });
    const disabled = await sendCompanyUserResetLinkAction('company-1', 'user-2');
    m.mockCompanyUserFindFirst.mockResolvedValueOnce(null);
    const unknown = await sendCompanyUserResetLinkAction('company-1', 'nope');

    expect(disabled?.error).toContain('désactivé');
    expect(unknown).toEqual({ error: 'Utilisateur introuvable.' });
    expect(m.mockCreatePasswordResetToken).not.toHaveBeenCalled();
    expect(m.mockSendEmail).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('impersonateCompanyUserAction', () => {
  it('opens a support session, sets the installer session cookie for one hour, logs it and opens the dashboard', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(member);
    m.mockCreateImpersonationSession.mockResolvedValue('support-token');

    await impersonateCompanyUserAction('company-1', 'user-2');

    expect(m.mockCreateImpersonationSession).toHaveBeenCalledWith('admin-1', 'user-2');
    expect(m.mockSet).toHaveBeenCalledWith('dossipv_session', 'support-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });
    expect(auditEntries()).toEqual([['impersonation.start', 'company-1', { userId: 'user-2', email: 'membre@solar.tn' }]]);
    expect(m.mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('refuses a disabled user and an unknown one', async () => {
    m.mockCompanyUserFindFirst.mockResolvedValueOnce({ ...member, disabledAt: new Date('2026-10-01') });
    const disabled = await impersonateCompanyUserAction('company-1', 'user-2');
    m.mockCompanyUserFindFirst.mockResolvedValueOnce(null);
    const unknown = await impersonateCompanyUserAction('company-1', 'nope');

    expect(disabled).toEqual({ error: 'Cet utilisateur est désactivé.' });
    expect(unknown).toEqual({ error: 'Utilisateur introuvable.' });
    expect(m.mockCreateImpersonationSession).not.toHaveBeenCalled();
    expect(m.mockSet).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('authorization — no user action runs without a valid super-admin session', () => {
  class FakeNextRedirect extends Error {}

  beforeEach(() => {
    m.mockGet.mockReturnValue(undefined);
    m.mockValidateSuperAdminSession.mockResolvedValue(null);
    m.mockRedirect.mockImplementation(() => {
      throw new FakeNextRedirect();
    });
  });

  afterEach(() => {
    m.mockRedirect.mockReset();
  });

  it('redirects to /admin/login and writes nothing', async () => {
    for (const action of [disableCompanyUserAction, enableCompanyUserAction, sendCompanyUserResetLinkAction, impersonateCompanyUserAction]) {
      await expect(action('company-1', 'user-2')).rejects.toThrow(FakeNextRedirect);
    }
    await expect(changeCompanyUserEmailAction('company-1', 'user-2', undefined, form({ email: 'a@b.tn' }))).rejects.toThrow(FakeNextRedirect);

    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/login');
    expect(m.mockCompanyUserFindFirst).not.toHaveBeenCalled();
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
    expect(m.mockCreateImpersonationSession).not.toHaveBeenCalled();
    expect(m.mockSet).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});
