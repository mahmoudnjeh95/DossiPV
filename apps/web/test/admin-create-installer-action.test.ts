import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockHashPassword: vi.fn((password: string) => Promise.resolve(`hashed:${password}`)),
    mockCompanyUserFindUnique: vi.fn(),
    mockCompanyFindFirst: vi.fn(),
    mockCompanyCreate: vi.fn(),
    mockPlanFindUnique: vi.fn(),
    mockAuditCreate: vi.fn(),
  };
});

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
      companyUser: { findUnique: m.mockCompanyUserFindUnique },
      company: { findFirst: m.mockCompanyFindFirst, create: m.mockCompanyCreate },
      plan: { findUnique: m.mockPlanFindUnique },
      adminAuditLog: { create: m.mockAuditCreate },
    },
  };
});

import { createInstallerAction } from '../app/admin/(protected)/installers/actions';

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const fields = {
  name: 'SolarPro Tunisie',
  address: '12 Rue de la Liberté, Tunis',
  phone: '+216 71 234 567',
  email: 'contact@solarpro.tn',
  legalRepFullName: 'Ahmed Ben Ali',
  anmeCode: 'ANME-2024-001',
  anmeCategory: 'BT',
  anmeValidFrom: '2024-01-01',
  anmeValidTo: '2027-01-01',
  ownerFullName: 'Ahmed Ben Ali',
  ownerEmail: 'Owner@SolarPro.tn',
  ownerPassword: 'un-mot-de-passe',
  planId: '',
  periodEnd: '',
};

beforeEach(() => {
  m.mockGet.mockReset();
  m.mockGet.mockReturnValue({ value: 'valid-admin-token' });
  m.mockRedirect.mockReset();
  m.mockValidateSuperAdminSession.mockReset();
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  for (const mock of [m.mockCompanyUserFindUnique, m.mockCompanyFindFirst, m.mockCompanyCreate, m.mockPlanFindUnique, m.mockAuditCreate]) {
    mock.mockReset();
  }
  m.mockCompanyUserFindUnique.mockResolvedValue(null);
  m.mockCompanyFindFirst.mockResolvedValue(null);
  m.mockCompanyCreate.mockResolvedValue({ id: 'company-new' });
});

describe('createInstallerAction', () => {
  it('creates the company with its OWNER login in one write, logs it and opens its page', async () => {
    await createInstallerAction(undefined, form(fields));

    expect(m.mockCompanyCreate).toHaveBeenCalledWith({
      data: {
        name: 'SolarPro Tunisie',
        address: '12 Rue de la Liberté, Tunis',
        phone: '+216 71 234 567',
        email: 'contact@solarpro.tn',
        legalRepFullName: 'Ahmed Ben Ali',
        anmeCode: 'ANME-2024-001',
        anmeCategory: 'BT',
        anmeValidFrom: new Date('2024-01-01'),
        anmeValidTo: new Date('2027-01-01'),
        users: { create: { email: 'owner@solarpro.tn', fullName: 'Ahmed Ben Ali', role: 'OWNER', passwordHash: 'hashed:un-mot-de-passe' } },
      },
    });
    expect(m.mockAuditCreate).toHaveBeenCalledWith({
      data: {
        superAdminId: 'admin-1',
        action: 'company.create',
        targetCompanyId: 'company-new',
        details: { name: 'SolarPro Tunisie', ownerEmail: 'owner@solarpro.tn', planId: null, periodEnd: null },
      },
    });
    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/installers/company-new');
  });

  it('creates an active subscription when a plan is chosen', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-1', audience: 'INSTALLER' });

    await createInstallerAction(undefined, form({ ...fields, planId: 'plan-1', periodEnd: '2027-01-01' }));

    expect((m.mockCompanyCreate.mock.calls[0]?.[0] as { data: { subscription: unknown } }).data.subscription).toEqual({
      create: { planId: 'plan-1', status: 'ACTIVE', periodStart: expect.any(Date) as unknown, periodEnd: new Date('2027-01-01') },
    });
  });

  it('refuses an archived plan', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-old', archivedAt: new Date('2026-09-01') });

    const result = await createInstallerAction(undefined, form({ ...fields, planId: 'plan-old', periodEnd: '2027-01-01' }));

    expect(result).toEqual({ error: "Ce plan est archivé : il n'est plus proposé." });
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('refuses a supplier pack for an installer', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'pack-1', audience: 'SUPPLIER', archivedAt: null });

    const result = await createInstallerAction(undefined, form({ ...fields, planId: 'pack-1', periodEnd: '2027-01-01' }));

    expect(result?.error).toContain('plan installateur');
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
  });

  it('requires an end date when a plan is chosen', async () => {
    const result = await createInstallerAction(undefined, form({ ...fields, planId: 'plan-1' }));

    expect(result?.error).toContain('Fin de période');
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
  });

  it('refuses a login email already in use', async () => {
    m.mockCompanyUserFindUnique.mockResolvedValue({ id: 'user-9' });

    const result = await createInstallerAction(undefined, form(fields));

    expect(m.mockCompanyUserFindUnique).toHaveBeenCalledWith({ where: { email: 'owner@solarpro.tn' } });
    expect(result).toEqual({ error: 'Cet email de connexion est déjà utilisé par un autre compte.' });
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
  });

  it('refuses an ANME code already registered, whatever its case', async () => {
    m.mockCompanyFindFirst.mockResolvedValue({ name: 'Autre Solaire' });

    const result = await createInstallerAction(undefined, form(fields));

    expect(m.mockCompanyFindFirst).toHaveBeenCalledWith({
      where: { anmeCode: { equals: 'ANME-2024-001', mode: 'insensitive' } },
      select: { name: true },
    });
    expect(result).toEqual({ error: 'Ce code ANME est déjà inscrit (Autre Solaire).' });
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
  });

  it('refuses ANME dates in the wrong order and a short password', async () => {
    const result = await createInstallerAction(undefined, form({ ...fields, anmeValidTo: '2023-01-01', ownerPassword: 'court' }));

    expect(result?.error).toContain('fin de validité ANME');
    expect(result?.error).toContain('10 caractères minimum');
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
  });
});

describe('authorization', () => {
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

  it('redirects to /admin/login and never creates a company', async () => {
    await expect(createInstallerAction(undefined, form(fields))).rejects.toThrow(FakeNextRedirect);

    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/login');
  });
});
