import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockHashPassword: vi.fn((password: string) => Promise.resolve(`hashed:${password}`)),
    mockSubscriptionUpdate: vi.fn(),
    mockSubscriptionFindUnique: vi.fn(),
    mockSubscriptionCreate: vi.fn(),
    mockPaymentCreate: vi.fn(),
    mockPlanFindUnique: vi.fn(),
    mockPlanFindFirst: vi.fn(),
    mockCompanyFindUnique: vi.fn(),
    mockSubscriptionUpdateMany: vi.fn(),
    mockCompanyUserFindUnique: vi.fn(),
    mockCompanyUserFindFirst: vi.fn(),
    mockCompanyUserCreate: vi.fn(),
    mockCompanyUserUpdate: vi.fn(),
    mockSessionDeleteMany: vi.fn(),
    mockAuditCreate: vi.fn(),
    mockCompanyUpdateMany: vi.fn(),
  };
});
const { mockGet, mockRedirect, mockValidateSuperAdminSession, mockSubscriptionUpdate, mockPaymentCreate } = m;

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: m.mockValidateSuperAdminSession, hashPassword: m.mockHashPassword };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findUnique: m.mockCompanyFindUnique, updateMany: m.mockCompanyUpdateMany },
      subscription: { updateMany: m.mockSubscriptionUpdateMany, update: m.mockSubscriptionUpdate, findUnique: m.mockSubscriptionFindUnique, create: m.mockSubscriptionCreate },
      payment: { create: m.mockPaymentCreate },
      plan: { findUnique: m.mockPlanFindUnique, findFirst: m.mockPlanFindFirst },
      companyUser: {
        findUnique: m.mockCompanyUserFindUnique,
        findFirst: m.mockCompanyUserFindFirst,
        create: m.mockCompanyUserCreate,
        update: m.mockCompanyUserUpdate,
      },
      session: { deleteMany: m.mockSessionDeleteMany },
      adminAuditLog: { create: m.mockAuditCreate },
    },
  };
});

import {
  suspendSubscriptionAction,
  activateSubscriptionAction,
  recordPaymentAction,
  updatePeriodEndAction,
  assignPlanAction,
  addCompanyUserAction,
  resetCompanyUserPasswordAction,
} from '../app/admin/(protected)/installers/[id]/actions';
import { addMonths } from '../lib/subscription';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  for (const mock of [
    mockSubscriptionUpdate,
    mockPaymentCreate,
    m.mockSubscriptionFindUnique,
    m.mockSubscriptionCreate,
    m.mockPlanFindUnique,
    m.mockPlanFindFirst,
    m.mockCompanyFindUnique,
    m.mockSubscriptionUpdateMany,
    m.mockCompanyUserFindUnique,
    m.mockCompanyUserFindFirst,
    m.mockCompanyUserCreate,
    m.mockCompanyUserUpdate,
    m.mockSessionDeleteMany,
    m.mockAuditCreate,
    m.mockCompanyFindUnique,
    m.mockCompanyUpdateMany,
    m.mockSubscriptionUpdateMany,
  ]) {
    mock.mockReset();
  }
  m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER' });
});

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

interface AuditRow {
  superAdminId: string;
  action: string;
  targetCompanyId: string | null;
  details?: unknown;
}

/** The AdminAuditLog rows written. */
function auditRows(): AuditRow[] {
  return m.mockAuditCreate.mock.calls.map((call) => (call[0] as { data: AuditRow }).data);
}

/** The AdminAuditLog rows written, as [action, targetCompanyId, details]. */
function auditEntries(): [string, string | null, unknown][] {
  return auditRows().map((row) => [row.action, row.targetCompanyId, row.details]);
}

describe('suspendSubscriptionAction', () => {
  it('sets the subscription status to SUSPENDED and redirects back to the detail page', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    await suspendSubscriptionAction('company-1');

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { status: 'SUSPENDED' } });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('activateSubscriptionAction', () => {
  it('sets the subscription status to ACTIVE and redirects back to the detail page', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    await activateSubscriptionAction('company-1');

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { status: 'ACTIVE' } });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('recordPaymentAction', () => {
  it('creates a Payment row with recordedByAdmin true and redirects back', async () => {
    mockPaymentCreate.mockResolvedValue({});

    const formData = new FormData();
    formData.set('amountTnd', '150.00');
    formData.set('method', 'MANUAL');
    formData.set('note', 'Paiement en espèces');

    await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).toHaveBeenCalledWith({
      data: { companyId: 'company-1', amountTnd: 150, method: 'MANUAL', note: 'Paiement en espèces', recordedByAdmin: true },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });

  it('rejects a non-numeric amount without creating a Payment row', async () => {
    const formData = new FormData();
    formData.set('amountTnd', 'not-a-number');
    formData.set('method', 'MANUAL');

    const result = await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Montant invalide.' });
  });

  it('rejects a negative amount without creating a Payment row', async () => {
    const formData = new FormData();
    formData.set('amountTnd', '-50');
    formData.set('method', 'MANUAL');

    const result = await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Montant invalide.' });
  });
});

describe('updatePeriodEndAction', () => {
  it('updates the subscription periodEnd and redirects back', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    const formData = new FormData();
    formData.set('periodEnd', '2027-01-01');

    await updatePeriodEndAction('company-1', formData);

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      data: { periodEnd: new Date('2027-01-01') },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('recordPaymentAction — extending the subscription', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves a running subscription end by the months paid, from its current end', async () => {
    const periodEnd = new Date('2027-01-15T00:00:00Z');
    m.mockSubscriptionFindUnique.mockResolvedValue({ periodEnd, status: 'ACTIVE' });

    await recordPaymentAction('company-1', undefined, form({ amountTnd: '400', method: 'MANUAL', extendMonths: '2' }));

    expect(mockPaymentCreate).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { periodEnd: addMonths(periodEnd, 2) } });
    expect(auditEntries()).toEqual([
      ['payment.record', 'company-1', expect.objectContaining({ amountTnd: 400, extendMonths: 2, periodEnd: addMonths(periodEnd, 2).toISOString() })],
    ]);
  });

  it('counts from today and reactivates an expired subscription', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-10-23T12:00:00Z');
    vi.setSystemTime(now);
    m.mockSubscriptionFindUnique.mockResolvedValue({ periodEnd: new Date('2026-09-01T00:00:00Z'), status: 'EXPIRED' });

    await recordPaymentAction('company-1', undefined, form({ amountTnd: '200', method: 'MANUAL', extendMonths: '1' }));

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      data: { periodEnd: addMonths(now, 1), status: 'ACTIVE' },
    });
  });

  it('leaves a suspended subscription suspended', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue({ periodEnd: new Date('2027-01-15T00:00:00Z'), status: 'SUSPENDED' });

    await recordPaymentAction('company-1', undefined, form({ amountTnd: '200', method: 'MANUAL', extendMonths: '1' }));

    expect((mockSubscriptionUpdate.mock.calls[0]?.[0] as { data: object }).data).not.toHaveProperty('status');
  });

  it('does not touch the subscription when 0 months are paid', async () => {
    await recordPaymentAction('company-1', undefined, form({ amountTnd: '50', method: 'MANUAL', extendMonths: '0' }));

    expect(m.mockSubscriptionFindUnique).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unknown payment method and more than 24 months', async () => {
    const result = await recordPaymentAction('company-1', undefined, form({ amountTnd: '50', method: 'CASH', extendMonths: '30' }));

    expect(result?.error).toContain('Méthode');
    expect(result?.error).toContain('≤ 24');
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });
});

describe('subscription changes are written to the audit log', () => {
  it('logs suspend, activate and a new period end under the acting super-admin', async () => {
    await suspendSubscriptionAction('company-1');
    await activateSubscriptionAction('company-1');
    await updatePeriodEndAction('company-1', form({ periodEnd: '2027-01-01' }));

    expect(auditEntries()).toEqual([
      ['subscription.suspend', 'company-1', undefined],
      ['subscription.activate', 'company-1', undefined],
      ['subscription.periodEnd', 'company-1', { periodEnd: '2027-01-01' }],
    ]);
    expect(auditRows().every((row) => row.superAdminId === 'admin-1')).toBe(true);
  });
});

describe('assignPlanAction', () => {
  const plan = { id: 'plan-premium', name: 'Premium', audience: 'INSTALLER' };

  it("changes the plan of an existing subscription and keeps its end date", async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-standard' });
    m.mockPlanFindUnique.mockResolvedValue(plan);

    await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium' }));

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { planId: 'plan-premium' } });
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(auditEntries()).toEqual([['subscription.changePlan', 'company-1', { planId: 'plan-premium', planName: 'Premium' }]]);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });

  describe('a sponsored installer taking Premium itself (spec 2026-10-23 §5.3)', () => {
    const premium = { id: 'plan-premium', name: 'Premium', tier: 'PREMIUM', isTrial: false, archivedAt: null };

    it('leaves its sponsor and loses the 3D option', async () => {
      m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-standard' });
      m.mockPlanFindUnique.mockResolvedValue(premium);
      m.mockCompanyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1' });

      await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium' }));

      expect(m.mockCompanyUpdateMany).toHaveBeenCalledWith({ where: { id: 'company-1', sponsorCompanyId: { not: null } }, data: { sponsorCompanyId: null } });
      expect(m.mockSubscriptionUpdateMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { option3dUntil: null } });
      expect(auditEntries()).toEqual([['subscription.changePlan', 'company-1', { planId: 'plan-premium', planName: 'Premium', leftSponsor: true }]]);
    });

    it("turns the suspended row that only held its 3D option into the installer's own active plan", async () => {
      m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-standard', status: 'SUSPENDED' });
      m.mockPlanFindUnique.mockResolvedValue(premium);
      m.mockCompanyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1', kind: 'INSTALLER' });

      await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium', periodEnd: '2099-01-31' }));

      expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
        data: { planId: 'plan-premium', status: 'ACTIVE', periodStart: expect.any(Date), periodEnd: new Date('2099-01-31') },
      });
    });

    it('does not touch the sponsoring of a direct installer, nor when the new plan is not Premium', async () => {
      m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-standard' });
      m.mockPlanFindUnique.mockResolvedValue(premium);
      m.mockCompanyFindUnique.mockResolvedValue({ sponsorCompanyId: null });
      await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium' }));

      m.mockPlanFindUnique.mockResolvedValue({ ...premium, id: 'plan-std', name: 'Standard', tier: 'STANDARD' });
      m.mockCompanyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1' });
      await assignPlanAction('company-1', undefined, form({ planId: 'plan-std' }));

      expect(m.mockCompanyUpdateMany).not.toHaveBeenCalled();
      expect(m.mockSubscriptionUpdateMany).not.toHaveBeenCalled();
      expect(auditRows().every((row) => !('leftSponsor' in (row.details as object)))).toBe(true);
    });
  });

  it('replaces a trial with a paid plan: fresh period from today, ends on the typed date, trial kept in the log', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-trial', plan: { id: 'plan-trial', name: 'Essai gratuit', isTrial: true } });
    m.mockPlanFindUnique.mockResolvedValue({ ...plan, isTrial: false, archivedAt: null });

    await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium', periodEnd: '2027-01-01' }));

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      data: { planId: 'plan-premium', status: 'ACTIVE', periodStart: expect.any(Date) as unknown, periodEnd: new Date('2027-01-01') },
    });
    expect(auditEntries()).toEqual([
      ['subscription.changePlan', 'company-1', { planId: 'plan-premium', planName: 'Premium', from: 'Essai gratuit', periodEnd: '2027-01-01T00:00:00.000Z' }],
    ]);
  });

  it('requires an end date to leave the trial', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-trial', plan: { id: 'plan-trial', name: 'Essai gratuit', isTrial: true } });
    m.mockPlanFindUnique.mockResolvedValue({ ...plan, isTrial: false, archivedAt: null });

    const result = await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium' }));

    expect(result?.error).toContain('Fin de période');
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('creates an active subscription ending on the typed date when the company has none', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue(null);
    m.mockPlanFindUnique.mockResolvedValue(plan);

    await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium', periodEnd: '2027-01-01' }));

    expect(m.mockSubscriptionCreate).toHaveBeenCalledWith({
      data: { companyId: 'company-1', planId: 'plan-premium', status: 'ACTIVE', periodStart: expect.any(Date) as unknown, periodEnd: new Date('2027-01-01') },
    });
    expect(auditEntries()[0]![0]).toBe('subscription.create');
  });

  it('requires an end date for a new subscription', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue(null);

    const result = await assignPlanAction('company-1', undefined, form({ planId: 'plan-premium' }));

    expect(result?.error).toContain('Fin de période');
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it('refuses an unknown plan', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-standard' });
    m.mockPlanFindUnique.mockResolvedValue(null);

    const result = await assignPlanAction('company-1', undefined, form({ planId: 'nope' }));

    expect(result).toEqual({ error: 'Plan introuvable.' });
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('refuses moving a company onto an archived plan, or creating a subscription on one', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-old', name: 'Ancien', archivedAt: new Date('2026-09-01') });

    m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-standard' });
    const change = await assignPlanAction('company-1', undefined, form({ planId: 'plan-old' }));
    m.mockSubscriptionFindUnique.mockResolvedValue(null);
    const create = await assignPlanAction('company-1', undefined, form({ planId: 'plan-old', periodEnd: '2027-01-01' }));

    expect(change).toEqual({ error: "Ce plan est archivé : il n'est plus proposé." });
    expect(create).toEqual({ error: "Ce plan est archivé : il n'est plus proposé." });
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('lets a company already on an archived plan keep it', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue({ planId: 'plan-old' });
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-old', name: 'Ancien', audience: 'INSTALLER', archivedAt: new Date('2026-09-01') });

    const result = await assignPlanAction('company-1', undefined, form({ planId: 'plan-old' }));

    expect(result).toBeUndefined();
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('addCompanyUserAction', () => {
  const fields = { fullName: 'Fatma Trabelsi', email: '  Fatma@SolarPro.tn ', password: 'un-mot-de-passe', role: 'MEMBER' };

  it('creates the login with a lower-cased email and a hashed password, and logs it without the password', async () => {
    m.mockCompanyUserFindUnique.mockResolvedValue(null);

    await addCompanyUserAction('company-1', undefined, form(fields));

    expect(m.mockCompanyUserCreate).toHaveBeenCalledWith({
      data: { companyId: 'company-1', email: 'fatma@solarpro.tn', fullName: 'Fatma Trabelsi', role: 'MEMBER', passwordHash: 'hashed:un-mot-de-passe' },
    });
    expect(auditEntries()).toEqual([['user.create', 'company-1', { email: 'fatma@solarpro.tn', fullName: 'Fatma Trabelsi', role: 'MEMBER' }]]);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });

  it('refuses an email that already logs in to an account', async () => {
    m.mockCompanyUserFindUnique.mockResolvedValue({ id: 'user-9' });

    const result = await addCompanyUserAction('company-1', undefined, form(fields));

    expect(result).toEqual({ error: 'Cet email est déjà utilisé par un autre compte.' });
    expect(m.mockCompanyUserCreate).not.toHaveBeenCalled();
  });

  it('refuses a password shorter than 10 characters and an invalid email', async () => {
    const result = await addCompanyUserAction('company-1', undefined, form({ ...fields, email: 'pas-un-email', password: 'court' }));

    expect(result?.error).toContain('10 caractères minimum');
    expect(result?.error).toContain('adresse invalide');
    expect(m.mockCompanyUserFindUnique).not.toHaveBeenCalled();
  });
});

describe('resetCompanyUserPasswordAction', () => {
  it("sets the new hash, ends the user's sessions and logs it", async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue({ id: 'user-1', email: 'owner@solarpro.tn' });

    await resetCompanyUserPasswordAction('company-1', 'user-1', undefined, form({ password: 'nouveau-secret' }));

    expect(m.mockCompanyUserFindFirst).toHaveBeenCalledWith({ where: { id: 'user-1', companyId: 'company-1' } });
    expect(m.mockCompanyUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { passwordHash: 'hashed:nouveau-secret' } });
    expect(m.mockSessionDeleteMany).toHaveBeenCalledWith({ where: { companyUserId: 'user-1' } });
    expect(auditEntries()).toEqual([['user.resetPassword', 'company-1', { email: 'owner@solarpro.tn' }]]);
  });

  it("never touches a user of another company", async () => {
    m.mockCompanyUserFindFirst.mockResolvedValue(null);

    const result = await resetCompanyUserPasswordAction('company-1', 'user-of-company-2', undefined, form({ password: 'nouveau-secret' }));

    expect(result).toEqual({ error: 'Utilisateur introuvable.' });
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
    expect(m.mockSessionDeleteMany).not.toHaveBeenCalled();
  });
});

describe('authorization — no action may mutate data without a valid super-admin session', () => {
  class FakeNextRedirect extends Error {}

  beforeEach(() => {
    mockGet.mockReturnValue(undefined);
    mockValidateSuperAdminSession.mockResolvedValue(null);
    // Unlike the other describe blocks in this file, redirect() here must actually interrupt
    // execution the way Next's real redirect() does (it throws internally) — otherwise code
    // after an unauthenticated requireAuthenticatedSuperAdmin() call would appear safe under
    // test while actually running straight through in a mocked-but-inaccurate test double.
    mockRedirect.mockImplementation(() => {
      throw new FakeNextRedirect();
    });
  });

  afterEach(() => {
    mockRedirect.mockReset();
  });

  it('suspendSubscriptionAction redirects to /admin/login and never calls subscription.update', async () => {
    await expect(suspendSubscriptionAction('company-1')).rejects.toThrow(FakeNextRedirect);

    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('activateSubscriptionAction redirects to /admin/login and never calls subscription.update', async () => {
    await expect(activateSubscriptionAction('company-1')).rejects.toThrow(FakeNextRedirect);

    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('recordPaymentAction redirects to /admin/login and never calls payment.create', async () => {
    const formData = new FormData();
    formData.set('amountTnd', '150.00');
    formData.set('method', 'MANUAL');

    await expect(recordPaymentAction('company-1', undefined, formData)).rejects.toThrow(FakeNextRedirect);

    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('updatePeriodEndAction redirects to /admin/login and never calls subscription.update', async () => {
    const formData = new FormData();
    formData.set('periodEnd', '2027-01-01');

    await expect(updatePeriodEndAction('company-1', formData)).rejects.toThrow(FakeNextRedirect);

    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('assignPlanAction, addCompanyUserAction and resetCompanyUserPasswordAction redirect to /admin/login and write nothing', async () => {
    await expect(assignPlanAction('company-1', undefined, form({ planId: 'plan-1', periodEnd: '2027-01-01' }))).rejects.toThrow(FakeNextRedirect);
    await expect(
      addCompanyUserAction('company-1', undefined, form({ fullName: 'X', email: 'x@y.tn', password: 'un-mot-de-passe', role: 'OWNER' })),
    ).rejects.toThrow(FakeNextRedirect);
    await expect(resetCompanyUserPasswordAction('company-1', 'user-1', undefined, form({ password: 'nouveau-secret' }))).rejects.toThrow(
      FakeNextRedirect,
    );

    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(m.mockCompanyUserCreate).not.toHaveBeenCalled();
    expect(m.mockCompanyUserUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});
