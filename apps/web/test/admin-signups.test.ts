import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockRedirect: vi.fn(),
  mockValidateSuperAdminSession: vi.fn(),
  mockCompanyFindMany: vi.fn(),
  mockCompanyFindUnique: vi.fn(),
  mockCompanyUpdate: vi.fn(),
  mockCompanyCount: vi.fn(),
  mockProjectCount: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: vi.fn(() => Promise.resolve({ get: m.mockGet })) }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: m.mockValidateSuperAdminSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findMany: m.mockCompanyFindMany, findUnique: m.mockCompanyFindUnique, update: m.mockCompanyUpdate, count: m.mockCompanyCount },
      project: { count: m.mockProjectCount },
      adminAuditLog: { create: m.mockAuditCreate },
    },
  };
});

import { loadSignups, parseSignupFilter } from '../app/admin/(protected)/inscriptions/page';
import { markSignupContactedAction, markSignupUncontactedAction } from '../app/admin/(protected)/inscriptions/actions';
import { countSignupsToContact } from '../lib/admin-signups';

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

beforeEach(() => {
  for (const mock of Object.values(m)) mock.mockReset();
  m.mockGet.mockReturnValue({ value: 'valid-admin-token' });
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
});

describe('parseSignupFilter', () => {
  it('defaults to the sign-ups to contact', () => {
    expect(parseSignupFilter(undefined)).toBe('toContact');
    expect(parseSignupFilter('nope')).toBe('toContact');
    expect(parseSignupFilter('contacted')).toBe('contacted');
    expect(parseSignupFilter('all')).toBe('all');
  });
});

describe('loadSignups', () => {
  const periodStart = new Date('2026-10-01');
  const company = {
    id: 'c1',
    users: [{ emailVerifiedAt: null }, { emailVerifiedAt: new Date('2026-10-02') }],
    subscription: { periodStart, periodEnd: new Date('2026-10-31'), plan: { name: 'Essai gratuit', isTrial: true, monthlyDossierLimit: 3 } },
  };

  it('lists self sign-ups newest first and filters on the contacted state', async () => {
    m.mockCompanyFindMany.mockResolvedValue([]);

    await loadSignups('toContact');
    await loadSignups('contacted');
    await loadSignups('all');

    const wheres = m.mockCompanyFindMany.mock.calls.map((call) => (call[0] as { where: unknown }).where);
    expect(wheres).toEqual([
      { signupAt: { not: null }, signupContactedAt: null },
      { signupAt: { not: null }, signupContactedAt: { not: null } },
      { signupAt: { not: null } },
    ]);
    expect((m.mockCompanyFindMany.mock.calls[0]?.[0] as { orderBy: unknown }).orderBy).toEqual([{ signupAt: 'desc' }, { id: 'desc' }]);
  });

  it('counts the trial dossiers as distinct projects with a non-failed job since the period start', async () => {
    m.mockCompanyFindMany.mockResolvedValue([company, { ...company, id: 'c2', users: [], subscription: null }]);
    m.mockProjectCount.mockResolvedValue(2);

    const rows = await loadSignups('all');

    expect(m.mockProjectCount).toHaveBeenCalledTimes(1);
    expect(m.mockProjectCount).toHaveBeenCalledWith({
      where: { companyId: 'c1', jobs: { some: { status: { not: 'FAILED' }, startedAt: { gte: periodStart } } } },
    });
    expect(rows.map((row) => [row.company.id, row.emailVerified, row.dossiersUsed])).toEqual([
      ['c1', true, 2],
      ['c2', false, null],
    ]);
  });
});

describe('countSignupsToContact', () => {
  it('counts self sign-ups with no contact date', async () => {
    m.mockCompanyCount.mockResolvedValue(4);

    expect(await countSignupsToContact()).toBe(4);
    expect(m.mockCompanyCount).toHaveBeenCalledWith({ where: { signupAt: { not: null }, signupContactedAt: null } });
  });
});

describe('markSignupContactedAction', () => {
  it('sets the contact date and note and logs it', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ signupAt: new Date() });

    await markSignupContactedAction('c1', undefined, form({ note: 'Appelé, rappeler lundi' }));

    expect(m.mockCompanyUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { signupContactedAt: expect.any(Date) as unknown, signupNote: 'Appelé, rappeler lundi' },
    });
    expect(m.mockAuditCreate).toHaveBeenCalledWith({
      data: { superAdminId: 'admin-1', action: 'signup.contacted', targetCompanyId: 'c1', details: { note: 'Appelé, rappeler lundi' } },
    });
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/installers\/c1\?ok=/));
  });

  it('refuses a company that is not a self sign-up', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ signupAt: null });

    const result = await markSignupContactedAction('c1', undefined, form({ note: '' }));

    expect(result?.error).toContain("n'est pas une inscription");
    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('markSignupUncontactedAction', () => {
  it('clears the contact date and note and logs it', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ signupAt: new Date() });

    await markSignupUncontactedAction('c1');

    expect(m.mockCompanyUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { signupContactedAt: null, signupNote: null } });
    expect(m.mockAuditCreate).toHaveBeenCalledWith({
      data: { superAdminId: 'admin-1', action: 'signup.uncontacted', targetCompanyId: 'c1' },
    });
  });
});

describe('authorization', () => {
  class FakeNextRedirect extends Error {}

  it('redirects to /admin/login and writes nothing without an admin session', async () => {
    m.mockGet.mockReturnValue(undefined);
    m.mockValidateSuperAdminSession.mockResolvedValue(null);
    m.mockRedirect.mockImplementation(() => {
      throw new FakeNextRedirect();
    });

    await expect(markSignupContactedAction('c1', undefined, form({ note: 'x' }))).rejects.toThrow(FakeNextRedirect);
    await expect(markSignupUncontactedAction('c1')).rejects.toThrow(FakeNextRedirect);

    expect(m.mockCompanyUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/login');
  });
});
