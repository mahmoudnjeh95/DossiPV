import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockHashPassword: vi.fn((password: string) => Promise.resolve(`hashed:${password}`)),
    mockCompanyUserFindUnique: vi.fn(),
    mockCompanyCreate: vi.fn(),
    mockCompanyFindFirst: vi.fn(),
    mockCompanyFindUnique: vi.fn(),
    mockPlanFindUnique: vi.fn(),
    mockAuditCreate: vi.fn(),
    mockLinkInstaller: vi.fn(),
    mockUnlinkInstaller: vi.fn(),
    mockCompanyFindMany: vi.fn(),
    mockCompanyCount: vi.fn(),
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
      company: {
        create: m.mockCompanyCreate,
        findFirst: m.mockCompanyFindFirst,
        findUnique: m.mockCompanyFindUnique,
        findMany: m.mockCompanyFindMany,
        count: m.mockCompanyCount,
      },
      dossierJob: { count: vi.fn().mockResolvedValue(0) },
      claudeUsageLog: { aggregate: vi.fn().mockResolvedValue({ _sum: { costUsd: null } }) },
      payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountTnd: null } }) },
      plan: { findUnique: m.mockPlanFindUnique },
      adminAuditLog: { create: m.mockAuditCreate },
    },
  };
});
vi.mock('../lib/sponsorship', async () => {
  const actual = await vi.importActual<typeof import('../lib/sponsorship')>('../lib/sponsorship');
  return { ...actual, linkInstaller: m.mockLinkInstaller, unlinkInstaller: m.mockUnlinkInstaller };
});

import { createSupplierAction } from '../app/admin/(protected)/fournisseurs/actions';
import { linkInstallerAction, unlinkInstallerAction } from '../app/admin/(protected)/fournisseurs/[id]/actions';
import { shapeSupplierRow } from '../app/admin/(protected)/fournisseurs/page';
import InstallerListPage, { shapeInstallerRow } from '../app/admin/(protected)/installers/page';
import SupplierListPage from '../app/admin/(protected)/fournisseurs/page';
import { computeDashboardStats } from '../app/admin/(protected)/page';
import { SponsorshipError } from '../lib/sponsorship';

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const fields = {
  name: 'Solaire Distribution',
  contactName: 'Sami Trabelsi',
  email: 'contact@solaire-distribution.tn',
  phone: '+216 71 000 000',
  ownerEmail: 'Sami@Solaire-Distribution.tn',
  ownerPassword: 'un-mot-de-passe',
  planId: '',
  periodEnd: '',
};

function auditEntries(): [string, string | null, unknown][] {
  return m.mockAuditCreate.mock.calls.map((call) => {
    const data = (call[0] as { data: { action: string; targetCompanyId: string | null; details?: unknown } }).data;
    return [data.action, data.targetCompanyId, data.details];
  });
}

beforeEach(() => {
  m.mockGet.mockReset();
  m.mockGet.mockReturnValue({ value: 'valid-admin-token' });
  m.mockValidateSuperAdminSession.mockReset();
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  for (const mock of [
    m.mockRedirect,
    m.mockCompanyUserFindUnique,
    m.mockCompanyCreate,
    m.mockCompanyFindFirst,
    m.mockCompanyFindUnique,
    m.mockPlanFindUnique,
    m.mockAuditCreate,
    m.mockLinkInstaller,
    m.mockUnlinkInstaller,
    m.mockCompanyFindMany,
    m.mockCompanyCount,
  ]) {
    mock.mockReset();
  }
  m.mockCompanyUserFindUnique.mockResolvedValue(null);
  m.mockCompanyCreate.mockResolvedValue({ id: 'supplier-new' });
});

describe('createSupplierAction', () => {
  it('creates a SUPPLIER company with placeholder legacy columns and its OWNER login, logs it and opens its page', async () => {
    await createSupplierAction(undefined, form(fields));

    const data = (m.mockCompanyCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      kind: 'SUPPLIER',
      name: 'Solaire Distribution',
      address: '',
      phone: '+216 71 000 000',
      email: 'contact@solaire-distribution.tn',
      legalRepFullName: 'Sami Trabelsi',
      anmeCategory: 'BT',
      anmeValidFrom: new Date('2000-01-01'),
      anmeValidTo: new Date('2000-01-01'),
      profileComplete: true,
      users: { create: { email: 'sami@solaire-distribution.tn', fullName: 'Sami Trabelsi', role: 'OWNER', passwordHash: 'hashed:un-mot-de-passe' } },
    });
    expect(data.anmeCode).toMatch(/^FOURNISSEUR-[A-Z0-9]{6}$/);
    expect(data).not.toHaveProperty('subscription');
    expect(auditEntries()).toEqual([
      ['supplier.create', 'supplier-new', { name: 'Solaire Distribution', ownerEmail: 'sami@solaire-distribution.tn', planId: null, periodEnd: null }],
    ]);
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/fournisseurs\/supplier-new\?ok=/));
  });

  it('draws a different placeholder ANME code each time', async () => {
    await createSupplierAction(undefined, form(fields));
    await createSupplierAction(undefined, form(fields));

    const codes = m.mockCompanyCreate.mock.calls.map((call) => (call[0] as { data: { anmeCode: string } }).data.anmeCode);
    expect(new Set(codes).size).toBe(2);
  });

  it('creates the pack subscription when a pack is chosen', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'pack-1', audience: 'SUPPLIER', archivedAt: null });

    await createSupplierAction(undefined, form({ ...fields, planId: 'pack-1', periodEnd: '2027-01-01' }));

    expect((m.mockCompanyCreate.mock.calls[0]?.[0] as { data: { subscription: unknown } }).data.subscription).toEqual({
      create: { planId: 'pack-1', status: 'ACTIVE', periodStart: expect.any(Date) as unknown, periodEnd: new Date('2027-01-01') },
    });
  });

  it('refuses an installer plan, an archived pack and an unknown pack', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-std', audience: 'INSTALLER', archivedAt: null });
    const installerPlan = await createSupplierAction(undefined, form({ ...fields, planId: 'plan-std', periodEnd: '2027-01-01' }));
    m.mockPlanFindUnique.mockResolvedValue({ id: 'pack-old', audience: 'SUPPLIER', archivedAt: new Date('2026-09-01') });
    const archived = await createSupplierAction(undefined, form({ ...fields, planId: 'pack-old', periodEnd: '2027-01-01' }));
    m.mockPlanFindUnique.mockResolvedValue(null);
    const unknown = await createSupplierAction(undefined, form({ ...fields, planId: 'nope', periodEnd: '2027-01-01' }));

    expect(installerPlan?.error).toContain('pack fournisseur');
    expect(archived?.error).toContain('archivé');
    expect(unknown?.error).toContain('introuvable');
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
  });

  it('requires an end date with a pack, and a login email not already used', async () => {
    const noDate = await createSupplierAction(undefined, form({ ...fields, planId: 'pack-1' }));
    m.mockCompanyUserFindUnique.mockResolvedValue({ id: 'user-1' });
    const taken = await createSupplierAction(undefined, form(fields));

    expect(noDate?.error).toContain('Fin de période');
    expect(taken?.error).toContain('déjà utilisé');
    expect(m.mockCompanyCreate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('linkInstallerAction / unlinkInstallerAction', () => {
  it('links an installer and logs it', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ name: 'Solar Co' });

    await linkInstallerAction('supplier-1', undefined, form({ installerId: 'installer-1' }));

    expect(m.mockLinkInstaller).toHaveBeenCalledWith('installer-1', 'supplier-1');
    expect(auditEntries()).toEqual([['supplier.linkInstaller', 'supplier-1', { installerId: 'installer-1', installerName: 'Solar Co' }]]);
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/fournisseurs\/supplier-1\?ok=/));
  });

  it('shows the sponsorship refusal (pack full) and logs nothing', async () => {
    m.mockLinkInstaller.mockRejectedValue(new SponsorshipError('Votre pack est complet'));

    const result = await linkInstallerAction('supplier-1', undefined, form({ installerId: 'installer-1' }));

    expect(result).toEqual({ error: 'Votre pack est complet' });
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('lets unexpected errors through', async () => {
    m.mockLinkInstaller.mockRejectedValue(new Error('db down'));

    await expect(linkInstallerAction('supplier-1', undefined, form({ installerId: 'installer-1' }))).rejects.toThrow('db down');
  });

  it('requires an installer', async () => {
    const result = await linkInstallerAction('supplier-1', undefined, form({}));

    expect(result?.error).toContain('Installateur');
    expect(m.mockLinkInstaller).not.toHaveBeenCalled();
  });

  it('unlinks only an installer this supplier sponsors, and logs it', async () => {
    m.mockCompanyFindFirst.mockResolvedValue({ name: 'Solar Co' });

    await unlinkInstallerAction('supplier-1', 'installer-1');

    expect(m.mockCompanyFindFirst).toHaveBeenCalledWith({ where: { id: 'installer-1', sponsorCompanyId: 'supplier-1' }, select: { name: true } });
    expect(m.mockUnlinkInstaller).toHaveBeenCalledWith('installer-1');
    expect(auditEntries()).toEqual([['supplier.unlinkInstaller', 'supplier-1', { installerId: 'installer-1', installerName: 'Solar Co' }]]);
  });

  it('ignores an installer sponsored by someone else', async () => {
    m.mockCompanyFindFirst.mockResolvedValue(null);

    await unlinkInstallerAction('supplier-1', 'installer-9');

    expect(m.mockUnlinkInstaller).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/fournisseurs\/supplier-1\?ok=/));
  });
});

describe('lists and dashboard', () => {
  it('lists only INSTALLER companies on the installer page', async () => {
    m.mockCompanyFindMany.mockResolvedValue([]);

    await InstallerListPage({ searchParams: Promise.resolve({}) });

    expect((m.mockCompanyFindMany.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({ kind: 'INSTALLER' });
  });

  it('lists only SUPPLIER companies on the suppliers page', async () => {
    m.mockCompanyFindMany.mockResolvedValue([]);

    await SupplierListPage({ searchParams: Promise.resolve({}) });

    expect((m.mockCompanyFindMany.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({ kind: 'SUPPLIER' });
  });

  it('filters the lists on the search query (name, email, phone, contact)', async () => {
    m.mockCompanyFindMany.mockResolvedValue([]);

    await SupplierListPage({ searchParams: Promise.resolve({ q: ' sol ' }) });

    const where = (m.mockCompanyFindMany.mock.calls[0]?.[0] as { where: { kind: string; OR: unknown[] } }).where;
    expect(where.kind).toBe('SUPPLIER');
    expect(where.OR).toHaveLength(4);
  });

  it('counts installers apart from suppliers and sponsored installers on the dashboard', async () => {
    m.mockCompanyCount.mockImplementation((args: { where: { kind: string; sponsorCompanyId?: unknown } }) =>
      Promise.resolve(args.where.kind === 'SUPPLIER' ? 3 : args.where.sponsorCompanyId ? 20 : 40),
    );

    const stats = await computeDashboardStats(new Date('2026-10-15'));

    expect(stats).toMatchObject({ activeInstallers: 40, suppliers: 3, sponsoredInstallers: 20 });
  });
});

describe('list shaping', () => {
  it('shows seats used / max, the pack and the subscription status of a supplier', () => {
    const row = shapeSupplierRow({
      id: 's1',
      name: 'Solaire Distribution',
      subscription: { status: 'ACTIVE', periodEnd: new Date('2027-01-01'), plan: { name: 'Pack 50', maxSponsoredInstallers: 50 } },
      _count: { sponsoredInstallers: 12 },
    });

    expect(row).toMatchObject({ packName: 'Pack 50', subscriptionStatus: 'ACTIVE', seatsUsed: 12, seatsMax: 50 });
  });

  it('shows a supplier without a pack', () => {
    const row = shapeSupplierRow({ id: 's1', name: 'X', subscription: null, _count: { sponsoredInstallers: 0 } });

    expect(row).toMatchObject({ packName: 'Aucun pack', subscriptionStatus: null, seatsMax: null });
  });

  it('carries the sponsor name of an installer row for the badge', () => {
    const row = shapeInstallerRow(
      { id: 'i1', name: 'Solar Co', subscription: null, users: [], projects: [], sponsor: { name: 'Solaire Distribution' } },
      new Date('2026-10-15'),
    );

    expect(row.sponsorName).toBe('Solaire Distribution');
  });
});
