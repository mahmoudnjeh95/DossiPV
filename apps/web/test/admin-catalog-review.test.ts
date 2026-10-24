import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    pvModuleUpdate: vi.fn(),
    pvModuleUpdateMany: vi.fn(),
    pvModuleDelete: vi.fn(),
    inverterUpdate: vi.fn(),
    inverterUpdateMany: vi.fn(),
    inverterDelete: vi.fn(),
    cableUpdateMany: vi.fn(),
    syncSuppliersCarrying: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mocks.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: mocks.mockValidateSuperAdminSession };
});
vi.mock('../lib/sponsorship', () => ({ syncSuppliersCarrying: mocks.syncSuppliersCarrying }));
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      pvModule: { update: mocks.pvModuleUpdate, updateMany: mocks.pvModuleUpdateMany, delete: mocks.pvModuleDelete },
      inverter: { update: mocks.inverterUpdate, updateMany: mocks.inverterUpdateMany, delete: mocks.inverterDelete },
      cable: { updateMany: mocks.cableUpdateMany },
    },
  };
});

import { Prisma } from '@dossipv/db';
import { publishCatalogItemAction, rejectCatalogItemAction, publishCleanDraftsAction, publishCuratedDraftsAction } from '../app/admin/(protected)/catalog-review/actions';
import { describeInverter } from '../app/admin/(protected)/catalog-review/describe-item';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockGet.mockReturnValue({ value: 'admin-token' });
  mocks.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'a@b.c' });
});

describe('catalog review actions', () => {
  it('publishes one draft', async () => {
    await publishCatalogItemAction('PV_MODULE', 'm1');
    expect(mocks.pvModuleUpdate).toHaveBeenCalledWith({ where: { id: 'm1', catalogStatus: 'DRAFT' }, data: { catalogStatus: 'PUBLISHED', importNotes: null } });
    expect(mocks.syncSuppliersCarrying).toHaveBeenCalledWith('PV_MODULE', ['m1']);
  });

  it('syncs the sponsored installers of every supplier after a bulk publish', async () => {
    await publishCleanDraftsAction('INVERTER');
    expect(mocks.syncSuppliersCarrying).toHaveBeenCalledWith('INVERTER', 'all');
  });

  it('publishes every curated cable draft at once', async () => {
    await publishCuratedDraftsAction('CABLE');
    expect(mocks.cableUpdateMany).toHaveBeenCalledWith({
      where: { ownerCompanyId: null, catalogStatus: 'DRAFT' },
      data: { catalogStatus: 'PUBLISHED' },
    });
  });

  it('publishes in bulk only the drafts without notes', async () => {
    await publishCleanDraftsAction('INVERTER');
    expect(mocks.inverterUpdateMany).toHaveBeenCalledWith({
      where: { ownerCompanyId: null, catalogStatus: 'DRAFT', importNotes: null },
      data: { catalogStatus: 'PUBLISHED' },
    });
  });

  it('deletes a rejected draft', async () => {
    expect(await rejectCatalogItemAction('INVERTER', 'i1')).toBeUndefined();
    expect(mocks.inverterDelete).toHaveBeenCalledWith({ where: { id: 'i1', catalogStatus: 'DRAFT' } });
  });

  it('revalidates the review page after a rejection', async () => {
    await rejectCatalogItemAction('PV_MODULE', 'm1');
    expect(mocks.pvModuleDelete).toHaveBeenCalledWith({ where: { id: 'm1', catalogStatus: 'DRAFT' } });
    expect(mocks.mockRevalidatePath).toHaveBeenCalledWith('/admin/catalog-review');
  });

  it('reports a foreign-key violation as in use', async () => {
    mocks.inverterDelete.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' }));
    expect(await rejectCatalogItemAction('INVERTER', 'i1')).toEqual({ error: 'Suppression impossible : cet équipement est déjà utilisé.' });
  });

  it('rethrows any other deletion failure', async () => {
    mocks.inverterDelete.mockRejectedValue(new Error('db down'));
    await expect(rejectCatalogItemAction('INVERTER', 'i1')).rejects.toThrow('db down');
  });

  it('refuses every action without a super-admin session', async () => {
    mocks.mockValidateSuperAdminSession.mockResolvedValue(null);
    await publishCatalogItemAction('PV_MODULE', 'm1');
    expect(mocks.pvModuleUpdate).not.toHaveBeenCalled();
    expect(mocks.mockRedirect).toHaveBeenCalled();
  });
});

describe('describeInverter', () => {
  it('summarises the values the reviewer compares with the datasheet', () => {
    expect(describeInverter({ phases: 3, pacW: 12000, sacVA: 13200, vdcMaxV: 1100, mpptMinV: 140, mpptMaxV: 980, startUpV: 200, mpptCount: 2, inputsPerMppt: 2, idcMaxPerMpptA: 30, iscMaxPerMpptA: 40, vacNomV: 400, iacMaxA: 20.2 })).toEqual([
      'Triphasé · 12000 W / 13200 VA · 400 V · Iac max 20.2 A',
      'DC max 1100 V · MPPT 140–980 V · démarrage 200 V',
      '2 MPPT × 2 entrée(s) · Idc 30 A · Isc 40 A par MPPT',
    ]);
  });
});
