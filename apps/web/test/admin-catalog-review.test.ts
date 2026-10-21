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
  };
});

vi.mock('next/headers', () => ({ cookies: mocks.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: mocks.mockValidateSuperAdminSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      pvModule: { update: mocks.pvModuleUpdate, updateMany: mocks.pvModuleUpdateMany, delete: mocks.pvModuleDelete },
      inverter: { update: mocks.inverterUpdate, updateMany: mocks.inverterUpdateMany, delete: mocks.inverterDelete },
    },
  };
});

import { publishCatalogItemAction, rejectCatalogItemAction, publishCleanDraftsAction } from '../app/admin/(protected)/catalog-review/actions';
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
