import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockCompanyFindUnique: vi.fn(),
    mockPlanFindFirst: vi.fn(),
    mockPlanFindUnique: vi.fn(),
    mockSubscriptionCreate: vi.fn(),
    mockSubscriptionUpdate: vi.fn(),
    mockSubscriptionUpdateMany: vi.fn(),
    mockSubscriptionFindUnique: vi.fn(),
    mockAuditCreate: vi.fn(),
    mockSettingsFindUnique: vi.fn(),
    mockSettingsUpsert: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
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
      company: { findUnique: m.mockCompanyFindUnique },
      plan: { findFirst: m.mockPlanFindFirst, findUnique: m.mockPlanFindUnique },
      subscription: {
        create: m.mockSubscriptionCreate,
        update: m.mockSubscriptionUpdate,
        updateMany: m.mockSubscriptionUpdateMany,
        findUnique: m.mockSubscriptionFindUnique,
      },
      platformSettings: { findUnique: m.mockSettingsFindUnique, upsert: m.mockSettingsUpsert },
      adminAuditLog: { create: m.mockAuditCreate },
    },
  };
});

import {
  assignPlanAction,
  clearOption3dAction,
  extendOption3dAction,
} from '../app/admin/(protected)/installers/[id]/actions';
import { updateOption3dPriceAction } from '../app/admin/(protected)/settings/actions';
import { addMonths } from '../lib/subscription';

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

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
    m.mockCompanyFindUnique,
    m.mockPlanFindFirst,
    m.mockPlanFindUnique,
    m.mockSubscriptionCreate,
    m.mockSubscriptionUpdate,
    m.mockSubscriptionUpdateMany,
    m.mockSubscriptionFindUnique,
    m.mockAuditCreate,
    m.mockSettingsFindUnique,
    m.mockSettingsUpsert,
  ]) {
    mock.mockReset();
  }
});

describe('assignPlanAction audience rules', () => {
  it('refuses a supplier pack for an installer and an installer plan for a supplier', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue(null);

    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER' });
    m.mockPlanFindUnique.mockResolvedValue({ id: 'pack-1', name: 'Pack 50', audience: 'SUPPLIER', archivedAt: null });
    const installer = await assignPlanAction('company-1', undefined, form({ planId: 'pack-1', periodEnd: '2027-01-01' }));

    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'SUPPLIER' });
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-std', name: 'Standard', audience: 'INSTALLER', archivedAt: null });
    const supplier = await assignPlanAction('company-2', undefined, form({ planId: 'plan-std', periodEnd: '2027-01-01' }));

    expect(installer?.error).toContain('plan installateur');
    expect(supplier?.error).toContain('pack fournisseur');
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('gives a supplier a pack', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'SUPPLIER' });
    m.mockSubscriptionFindUnique.mockResolvedValue(null);
    m.mockPlanFindUnique.mockResolvedValue({ id: 'pack-1', name: 'Pack 50', audience: 'SUPPLIER', archivedAt: null });

    const result = await assignPlanAction('supplier-1', undefined, form({ planId: 'pack-1', periodEnd: '2027-01-01' }));

    expect(result).toBeUndefined();
    expect(m.mockSubscriptionCreate).toHaveBeenCalledOnce();
  });
});

describe('extendOption3dAction', () => {
  const sponsored = { kind: 'INSTALLER', sponsorCompanyId: 'supplier-1', subscription: null };

  it('refuses a direct installer: it must move to Premium', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'INSTALLER', sponsorCompanyId: null, subscription: null });

    const result = await extendOption3dAction('company-1', undefined, form({ months: '1' }));

    expect(result?.error).toContain('Premium');
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(m.mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('refuses a supplier and an unknown company', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ kind: 'SUPPLIER', sponsorCompanyId: null, subscription: null });
    expect((await extendOption3dAction('s', undefined, form({ months: '1' })))?.error).toContain('introuvable');
    m.mockCompanyFindUnique.mockResolvedValue(null);
    expect((await extendOption3dAction('x', undefined, form({ months: '1' })))?.error).toContain('introuvable');
  });

  it('validates the duration', async () => {
    const result = await extendOption3dAction('company-1', undefined, form({ months: '0' }));

    expect(result?.error).toContain('Durée');
    expect(m.mockCompanyFindUnique).not.toHaveBeenCalled();
  });

  it('holds the option on a SUSPENDED Standard row for a sponsored installer with no subscription', async () => {
    m.mockCompanyFindUnique.mockResolvedValue(sponsored);
    m.mockPlanFindFirst.mockResolvedValue({ id: 'plan-standard' });
    const before = new Date();

    await extendOption3dAction('company-1', undefined, form({ months: '3' }));

    expect(m.mockPlanFindFirst).toHaveBeenCalledWith({
      where: { audience: 'INSTALLER', tier: 'STANDARD', isTrial: false },
      orderBy: { createdAt: 'asc' },
    });
    const data = (m.mockSubscriptionCreate.mock.calls[0]?.[0] as { data: { status: string; planId: string; option3dUntil: Date; periodEnd: Date } }).data;
    expect(data.status).toBe('SUSPENDED');
    expect(data.planId).toBe('plan-standard');
    expect(data.option3dUntil.getTime()).toBeGreaterThanOrEqual(addMonths(before, 3).getTime());
    expect(data.periodEnd).toEqual(data.option3dUntil);
    expect(auditEntries()[0]![0]).toBe('subscription.option3d');
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/installers\/company-1\?ok=/));
  });

  it('extends from the current end of the option while it still runs', async () => {
    const until = addMonths(new Date(), 2);
    m.mockCompanyFindUnique.mockResolvedValue({ ...sponsored, subscription: { option3dUntil: until } });

    await extendOption3dAction('company-1', undefined, form({ months: '1' }));

    expect(m.mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { option3dUntil: addMonths(until, 1) } });
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it('extends from today when the option has lapsed', async () => {
    m.mockCompanyFindUnique.mockResolvedValue({ ...sponsored, subscription: { option3dUntil: new Date('2020-01-01') } });
    const before = new Date();

    await extendOption3dAction('company-1', undefined, form({ months: '1' }));

    const until = (m.mockSubscriptionUpdate.mock.calls[0]?.[0] as { data: { option3dUntil: Date } }).data.option3dUntil;
    expect(until.getTime()).toBeGreaterThanOrEqual(addMonths(before, 1).getTime());
  });

  it('reports a missing Standard plan instead of guessing', async () => {
    m.mockCompanyFindUnique.mockResolvedValue(sponsored);
    m.mockPlanFindFirst.mockResolvedValue(null);

    const result = await extendOption3dAction('company-1', undefined, form({ months: '1' }));

    expect(result?.error).toContain('Standard');
    expect(m.mockSubscriptionCreate).not.toHaveBeenCalled();
  });
});

describe('clearOption3dAction', () => {
  it('clears the date and logs it', async () => {
    m.mockSubscriptionUpdateMany.mockResolvedValue({ count: 1 });

    await clearOption3dAction('company-1');

    expect(m.mockSubscriptionUpdateMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', option3dUntil: { not: null } },
      data: { option3dUntil: null },
    });
    expect(auditEntries()).toEqual([['subscription.option3d', 'company-1', { option3dUntil: null }]]);
  });

  it('logs nothing when there was no option', async () => {
    m.mockSubscriptionUpdateMany.mockResolvedValue({ count: 0 });

    await clearOption3dAction('company-1');

    expect(m.mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('updateOption3dPriceAction', () => {
  it('upserts the singleton settings row and logs the price', async () => {
    const result = await updateOption3dPriceAction(undefined, form({ option3dPriceTnd: '29.9' }));

    expect(result).toEqual({ saved: true });
    expect(m.mockSettingsUpsert).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      create: { id: 'singleton', option3dPriceTnd: 29.9 },
      update: { option3dPriceTnd: 29.9 },
    });
    expect(auditEntries()).toEqual([['settings.option3dPrice', null, { priceTnd: 29.9 }]]);
  });

  it('refuses a negative or missing price', async () => {
    expect((await updateOption3dPriceAction(undefined, form({ option3dPriceTnd: '-1' })))?.error).toContain('Prix');
    expect((await updateOption3dPriceAction(undefined, form({})))?.error).toContain('Prix');
    expect(m.mockSettingsUpsert).not.toHaveBeenCalled();
  });
});
