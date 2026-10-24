import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  companyFindUnique: vi.fn(),
  companyFindMany: vi.fn(),
  companyCount: vi.fn(),
  companyUpdate: vi.fn(),
  companyUpdateMany: vi.fn(),
  companyUserFindUnique: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  productFindMany: vi.fn(),
  libraryDeleteMany: vi.fn(),
  libraryCreateMany: vi.fn(),
  invitationFindUnique: vi.fn(),
  invitationDeleteMany: vi.fn(),
  invitationCreate: vi.fn(),
  invitationUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dossipv/db', () => ({
  db: {
    company: { findUnique: m.companyFindUnique, findMany: m.companyFindMany, count: m.companyCount, update: m.companyUpdate, updateMany: m.companyUpdateMany },
    companyUser: { findUnique: m.companyUserFindUnique },
    subscription: { findUnique: m.subscriptionFindUnique },
    supplierProduct: { findMany: m.productFindMany },
    libraryItem: { deleteMany: m.libraryDeleteMany, createMany: m.libraryCreateMany },
    supplierInvitation: { findUnique: m.invitationFindUnique, deleteMany: m.invitationDeleteMany, create: m.invitationCreate, updateMany: m.invitationUpdateMany },
    $transaction: m.transaction,
  },
}));

import {
  acceptInvitation,
  createInvitation,
  findValidInvitation,
  includes3d,
  linkInstaller,
  loadEffectiveSubscription,
  SponsorshipError,
  syncSponsoredLibrary,
  syncSupplierInstallers,
  unlinkInstaller,
} from '../lib/sponsorship';

const PACK = { plan: { maxSponsoredInstallers: 2, dossiersPerInstallerPerMonth: 5 }, status: 'ACTIVE' };

beforeEach(() => {
  vi.clearAllMocks();
  m.transaction.mockImplementation((operations: unknown[]) => Promise.resolve(operations));
  m.libraryDeleteMany.mockReturnValue('delete');
  m.libraryCreateMany.mockReturnValue('create');
  m.invitationDeleteMany.mockReturnValue('del-inv');
  m.invitationCreate.mockReturnValue('create-inv');
});

describe('syncSponsoredLibrary', () => {
  it("leaves a direct installer's library alone", async () => {
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: null });

    await syncSponsoredLibrary('installer-1');

    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("makes the sponsored installer's panels and inverters exactly what the supplier carries", async () => {
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1' });
    m.productFindMany.mockResolvedValue([
      { pvModuleId: 'panel-1', inverterId: null },
      { pvModuleId: 'panel-2', inverterId: null },
      { pvModuleId: null, inverterId: 'inv-1' },
    ]);

    await syncSponsoredLibrary('installer-1');

    expect(m.libraryDeleteMany).toHaveBeenCalledWith({ where: { companyId: 'installer-1', kind: 'PV_MODULE', pvModuleId: { notIn: ['panel-1', 'panel-2'] } } });
    expect(m.libraryDeleteMany).toHaveBeenCalledWith({ where: { companyId: 'installer-1', kind: 'INVERTER', inverterId: { notIn: ['inv-1'] } } });
    expect(m.libraryCreateMany).toHaveBeenCalledWith({
      data: [{ companyId: 'installer-1', kind: 'PV_MODULE', pvModuleId: 'panel-1' }, { companyId: 'installer-1', kind: 'PV_MODULE', pvModuleId: 'panel-2' }],
      skipDuplicates: true,
    });
    expect(m.libraryCreateMany).toHaveBeenCalledWith({ data: [{ companyId: 'installer-1', kind: 'INVERTER', inverterId: 'inv-1' }], skipDuplicates: true });
  });

  it('only counts published, sourced shared items as carried', async () => {
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1' });
    m.productFindMany.mockResolvedValue([]);

    await syncSponsoredLibrary('installer-1');

    const published = { ownerCompanyId: null, catalogStatus: 'PUBLISHED', datasheetSourceUrl: { not: null } };
    expect(m.productFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { supplierCompanyId: 'supplier-1', OR: [{ pvModule: published }, { inverter: published }] } }));
    // A supplier carrying nothing leaves the installer with no panel nor inverter.
    expect(m.libraryDeleteMany).toHaveBeenCalledWith({ where: { companyId: 'installer-1', kind: 'PV_MODULE', pvModuleId: { notIn: [] } } });
  });

  it('follows every installer of the supplier when its products change', async () => {
    m.companyFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1' });
    m.productFindMany.mockResolvedValue([]);

    await syncSupplierInstallers('supplier-1');

    expect(m.transaction).toHaveBeenCalledTimes(2);
  });
});

describe('createInvitation', () => {
  it('stores a hashed 7-day invitation for the normalised email and returns the raw token', async () => {
    m.companyCount.mockResolvedValue(1);
    m.subscriptionFindUnique.mockResolvedValue(PACK);
    m.companyUserFindUnique.mockResolvedValue(null);

    const result = await createInvitation('supplier-1', '  Ali@Example.TN ');

    expect(result.email).toBe('ali@example.tn');
    expect(result.token).toMatch(/^[0-9a-f]{32,}$/);
    const data = (m.invitationCreate.mock.calls[0]![0] as { data: { tokenHash: string; expiresAt: Date; email: string } }).data;
    expect(data.email).toBe('ali@example.tn');
    expect(data.tokenHash).not.toBe(result.token);
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    expect(m.invitationDeleteMany).toHaveBeenCalledWith({ where: { supplierCompanyId: 'supplier-1', email: 'ali@example.tn', acceptedAt: null } });
  });

  it('is refused when the pack is full, absent, or the address is a supplier or already sponsored', async () => {
    m.companyCount.mockResolvedValue(2);
    m.subscriptionFindUnique.mockResolvedValue(PACK);
    await expect(createInvitation('supplier-1', 'a@b.tn')).rejects.toThrow('pack est complet');

    m.subscriptionFindUnique.mockResolvedValue(null);
    await expect(createInvitation('supplier-1', 'a@b.tn')).rejects.toThrow('pas de pack actif');

    m.companyCount.mockResolvedValue(0);
    m.subscriptionFindUnique.mockResolvedValue(PACK);
    m.companyUserFindUnique.mockResolvedValue({ company: { kind: 'SUPPLIER', sponsorCompanyId: null } });
    await expect(createInvitation('supplier-1', 'a@b.tn')).rejects.toThrow('appartient à un fournisseur');

    m.companyUserFindUnique.mockResolvedValue({ company: { kind: 'INSTALLER', sponsorCompanyId: 'supplier-1' } });
    await expect(createInvitation('supplier-1', 'a@b.tn')).rejects.toThrow('déjà parrainé par vous');
    expect(m.invitationCreate).not.toHaveBeenCalled();
  });
});

describe('invitations and linking', () => {
  const invitation = { id: 'inv-1', email: 'a@b.tn', supplierCompanyId: 'supplier-1', acceptedAt: null, expiresAt: new Date(Date.now() + 1000), supplierCompany: { name: 'SolarTN' } };

  it('finds an invitation only while unused and unexpired', async () => {
    m.invitationFindUnique.mockResolvedValue(invitation);
    expect(await findValidInvitation('raw')).toEqual({ id: 'inv-1', email: 'a@b.tn', supplierCompanyId: 'supplier-1', supplierName: 'SolarTN' });

    m.invitationFindUnique.mockResolvedValue({ ...invitation, acceptedAt: new Date() });
    expect(await findValidInvitation('raw')).toBeNull();
    m.invitationFindUnique.mockResolvedValue({ ...invitation, expiresAt: new Date(Date.now() - 1) });
    expect(await findValidInvitation('raw')).toBeNull();
    m.invitationFindUnique.mockResolvedValue(null);
    expect(await findValidInvitation('raw')).toBeNull();
  });

  it('links an installer, gives it the supplier products and uses the invitation up', async () => {
    m.invitationFindUnique.mockResolvedValue(invitation);
    m.companyFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'supplier-1' ? { kind: 'SUPPLIER', sponsorCompanyId: null } : { kind: 'INSTALLER', sponsorCompanyId: null }),
    );
    m.companyCount.mockResolvedValue(0);
    m.subscriptionFindUnique.mockResolvedValue(PACK);
    m.invitationUpdateMany.mockResolvedValue({ count: 1 });
    m.productFindMany.mockResolvedValue([]);

    expect(await acceptInvitation('raw', 'installer-1')).toEqual({ supplierName: 'SolarTN' });

    expect(m.companyUpdate).toHaveBeenCalledWith({ where: { id: 'installer-1' }, data: { sponsorCompanyId: 'supplier-1' } });
    expect(m.invitationUpdateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', acceptedAt: null, expiresAt: { gt: expect.any(Date) as unknown } }, data: { acceptedAt: expect.any(Date) as unknown, acceptedCompanyId: 'installer-1' } });
  });

  it('refuses a used-up invitation, a supplier as installer, a second sponsor and a full pack', async () => {
    m.invitationFindUnique.mockResolvedValue(null);
    await expect(acceptInvitation('raw', 'installer-1')).rejects.toBeInstanceOf(SponsorshipError);

    const company = (kind: string, sponsor: string | null): { kind: string; sponsorCompanyId: string | null } => ({ kind, sponsorCompanyId: sponsor });
    m.companyFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'supplier-1' ? company('SUPPLIER', null) : company('SUPPLIER', null)));
    await expect(linkInstaller('x', 'supplier-1')).rejects.toThrow('Installateur introuvable');

    m.companyFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'supplier-1' ? company('SUPPLIER', null) : company('INSTALLER', 'other')));
    await expect(linkInstaller('x', 'supplier-1')).rejects.toThrow('déjà parrainé par un autre fournisseur');

    m.companyFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'supplier-1' ? company('SUPPLIER', null) : company('INSTALLER', null)));
    m.companyCount.mockResolvedValue(2);
    m.subscriptionFindUnique.mockResolvedValue(PACK);
    await expect(linkInstaller('x', 'supplier-1')).rejects.toThrow('pack est complet');
    expect(m.companyUpdate).not.toHaveBeenCalled();
  });

  it('works one time only: a second click on the same link finds it already claimed', async () => {
    m.invitationFindUnique.mockResolvedValue(invitation);
    m.invitationUpdateMany.mockResolvedValue({ count: 0 });

    await expect(acceptInvitation('raw', 'installer-1')).rejects.toThrow('n’est plus valide');
    expect(m.companyUpdate).not.toHaveBeenCalled();
  });

  it('unlinks an installer, freeing its seat', async () => {
    await unlinkInstaller('installer-1');
    expect(m.companyUpdateMany).toHaveBeenCalledWith({ where: { id: 'installer-1', sponsorCompanyId: { not: null } }, data: { sponsorCompanyId: null } });
  });
});

describe('loadEffectiveSubscription', () => {
  it("is a direct installer's own subscription", async () => {
    m.companyFindUnique.mockResolvedValue({
      sponsorCompanyId: null,
      subscription: { status: 'ACTIVE', periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-11-01'), option3dUntil: null, plan: { name: 'Premium', monthlyDossierLimit: 20, tier: 'PREMIUM', isTrial: false } },
    });

    expect(await loadEffectiveSubscription('c1')).toMatchObject({ sponsored: false, plan: { name: 'Premium', monthlyDossierLimit: 20, tier: 'PREMIUM' }, isTrial: false });
  });

  it("is a sponsored installer's Standard under its supplier's period, with the pack's per-installer quota", async () => {
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1', subscription: null });
    m.subscriptionFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      periodStart: new Date('2026-10-01'),
      periodEnd: new Date('2026-11-01'),
      plan: { dossiersPerInstallerPerMonth: 5, maxSponsoredInstallers: 50 },
    });

    expect(await loadEffectiveSubscription('c1')).toMatchObject({ sponsored: true, status: 'ACTIVE', periodEnd: new Date('2026-11-01'), plan: { monthlyDossierLimit: 5, tier: 'STANDARD' } });
  });

  it('follows its supplier: a lapsed or absent supplier subscription is not a valid one', async () => {
    m.companyFindUnique.mockResolvedValue({ sponsorCompanyId: 'supplier-1', subscription: null });
    m.subscriptionFindUnique.mockResolvedValue({ status: 'SUSPENDED', periodStart: new Date(), periodEnd: new Date(), plan: { dossiersPerInstallerPerMonth: 5 } });
    expect(await loadEffectiveSubscription('c1')).toMatchObject({ status: 'SUSPENDED' });

    m.subscriptionFindUnique.mockResolvedValue(null);
    expect(await loadEffectiveSubscription('c1')).toBeNull();
  });
});

describe('includes3d', () => {
  const now = new Date('2026-10-24');
  const base = { periodEnd: new Date('2026-12-01'), status: 'ACTIVE' };

  it('is Premium, or a sponsored Standard whose option is paid and running', () => {
    expect(includes3d({ ...base, plan: { tier: 'PREMIUM' }, option3dUntil: null }, now)).toBe(true);
    expect(includes3d({ ...base, plan: { tier: 'STANDARD' }, option3dUntil: new Date('2026-11-24') }, now)).toBe(true);
    expect(includes3d({ ...base, plan: { tier: 'STANDARD' }, option3dUntil: null }, now)).toBe(false);
    expect(includes3d({ ...base, plan: { tier: 'STANDARD' }, option3dUntil: new Date('2026-10-01') }, now)).toBe(false);
    expect(includes3d({ ...base, status: 'SUSPENDED', plan: { tier: 'STANDARD' }, option3dUntil: new Date('2026-11-24') }, now)).toBe(false);
  });
});
