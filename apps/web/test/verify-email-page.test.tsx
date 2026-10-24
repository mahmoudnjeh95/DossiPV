import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EmailMessage } from '@dossipv/email';

const m = vi.hoisted(() => ({
  adminEmail: null as string | null,
  mockPlanFindFirst: vi.fn(),
  mockSubscriptionFind: vi.fn(),
  mockSubscriptionCreate: vi.fn<(args: { data: { periodStart: Date; periodEnd: Date } }) => Promise<object>>(),
  mockCompanyFind: vi.fn(),
  mockVerify: vi.fn(),
  mockSendEmail: vi.fn<(message: EmailMessage) => Promise<{ sent: boolean }>>(),
}));

vi.mock('@dossipv/db', () => ({
  db: {
    plan: { findFirst: m.mockPlanFindFirst },
    company: { findUnique: m.mockCompanyFind },
    $transaction: (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
      callback({ subscription: { findUnique: m.mockSubscriptionFind, create: m.mockSubscriptionCreate } }),
  },
}));
vi.mock('@dossipv/auth', () => {
  class InvalidVerificationTokenError extends Error {}
  return { verifyEmailWithToken: m.mockVerify, InvalidVerificationTokenError };
});
vi.mock('@dossipv/email', () => ({
  sendEmail: m.mockSendEmail,
  appUrl: (path: string): string => `https://dossipv.tn${path}`,
  adminEmailAddress: (): string | null => m.adminEmail,
}));
// The resend form's server action is covered in signup-actions.test.ts.
vi.mock('../app/inscription/actions', () => ({ resendVerificationAction: vi.fn() }));

import VerifyEmailPage from '../app/verifier-email/page';
import { InvalidVerificationTokenError } from '@dossipv/auth';

async function render(token?: string): Promise<string> {
  const element = await VerifyEmailPage({ searchParams: Promise.resolve(token === undefined ? {} : { token }) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.adminEmail = 'admin@dossipv.tn';
  m.mockPlanFindFirst.mockResolvedValue({ id: 'trial-plan' });
  m.mockVerify.mockResolvedValue({ companyUserId: 'u1', companyId: 'c1', email: 'ali@solaire.tn' });
  m.mockSubscriptionFind.mockResolvedValue(null);
  m.mockSubscriptionCreate.mockResolvedValue({});
  m.mockCompanyFind.mockResolvedValue({
    name: 'Solaire Sfax', phone: '+216 20 000 000', anmeCode: 'INST-0042', signupContactName: 'Ali Ben Salah', signupGovernorate: 'Sfax',
  });
  m.mockSendEmail.mockResolvedValue({ sent: true });
});

describe('/verifier-email', () => {
  it('starts a 30-day ACTIVE trial on the trial plan and says so', async () => {
    const before = Date.now();
    const html = await render('good');

    expect(m.mockPlanFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { isTrial: true, archivedAt: null } }));
    const data = m.mockSubscriptionCreate.mock.calls[0]?.[0].data;
    if (!data) throw new Error("no subscription created");
    expect(data).toMatchObject({ companyId: 'c1', planId: 'trial-plan', status: 'ACTIVE' });
    expect(data.periodStart.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.periodEnd.getTime() - data.periodStart.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(html).toContain('Email confirmé, connectez-vous.');
    expect(html).toContain('href="/login"');
  });

  it('emails the installer a welcome and the admin the sign-up details', async () => {
    await render('good');

    expect(m.mockSendEmail).toHaveBeenCalledTimes(2);
    const [welcome, notice] = m.mockSendEmail.mock.calls.map((call) => call[0]);
    expect(welcome?.to).toBe('ali@solaire.tn');
    expect(welcome?.text).toContain('3 dossiers pendant 30 jours');
    expect(welcome?.text).toContain('admin@dossipv.tn');
    expect(welcome?.action?.url).toBe('https://dossipv.tn/login');
    expect(notice?.to).toBe('admin@dossipv.tn');
    for (const detail of ['Solaire Sfax', 'Ali Ben Salah', '+216 20 000 000', 'ali@solaire.tn', 'Sfax', 'INST-0042']) {
      expect(notice?.text).toContain(detail);
    }
    expect(notice?.action?.url).toBe('https://dossipv.tn/admin/inscriptions');
  });

  it('only emails the installer when no admin address is set', async () => {
    m.adminEmail = null;

    await render('good');

    expect(m.mockSendEmail).toHaveBeenCalledTimes(1);
    expect(m.mockSendEmail.mock.calls[0]?.[0].to).toBe('ali@solaire.tn');
  });

  it('creates the trial only once: a company that already has a subscription keeps it and nothing is sent', async () => {
    m.mockSubscriptionFind.mockResolvedValue({ id: 's1' });

    const html = await render('good');

    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(m.mockSendEmail).not.toHaveBeenCalled();
    expect(html).toContain('Email confirmé, connectez-vous.');
  });

  it('shows "no longer valid" with the resend form for a bad, used or expired link', async () => {
    m.mockVerify.mockRejectedValue(new InvalidVerificationTokenError());

    const html = await render('old');

    expect(html).toContain('Ce lien n’est plus valide.');
    expect(html).toContain('name="email"');
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(m.mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not look anything up without a token', async () => {
    const html = await render();

    expect(m.mockVerify).not.toHaveBeenCalled();
    expect(html).toContain('Ce lien n’est plus valide.');
  });

  it('asks to contact support, and leaves the link unused, when no trial plan exists', async () => {
    m.mockPlanFindFirst.mockResolvedValue(null);

    const html = await render('good');

    expect(m.mockVerify).not.toHaveBeenCalled();
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(html).toContain('contactez le support');
    expect(html).toContain('admin@dossipv.tn');
  });
});
