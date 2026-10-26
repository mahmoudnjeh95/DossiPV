import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockPlanCreate: vi.fn(),
    mockPlanUpdate: vi.fn(),
    mockPlanFindUnique: vi.fn(),
    mockPlanFindFirst: vi.fn(),
    mockAuditCreate: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
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
      plan: { create: m.mockPlanCreate, update: m.mockPlanUpdate, findUnique: m.mockPlanFindUnique, findFirst: m.mockPlanFindFirst },
      adminAuditLog: { create: m.mockAuditCreate },
    },
  };
});

import { archivePlanAction, createPlanAction, unarchivePlanAction, updatePlanAction } from '../app/admin/(protected)/plans/actions';

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const premium = { name: 'Premium', tier: 'PREMIUM', monthlyDossierLimit: '20', priceTnd: '349.5' };
/** What an installer plan stores: the pack columns stay neutral. */
const premiumData = {
  name: 'Premium',
  tier: 'PREMIUM',
  monthlyDossierLimit: 20,
  priceTnd: 349.5,
  isTrial: false,
  audience: 'INSTALLER',
  maxSponsoredInstallers: null,
  dossiersPerInstallerPerMonth: 5,
  includesHighlight: false,
};

beforeEach(() => {
  m.mockGet.mockReset();
  m.mockGet.mockReturnValue({ value: 'valid-admin-token' });
  m.mockRedirect.mockReset();
  m.mockValidateSuperAdminSession.mockReset();
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  m.mockPlanCreate.mockReset();
  m.mockPlanUpdate.mockReset();
  m.mockPlanFindUnique.mockReset();
  m.mockPlanFindFirst.mockReset();
  m.mockPlanFindFirst.mockResolvedValue(null);
  m.mockAuditCreate.mockReset();
});

describe('createPlanAction', () => {
  it('creates the plan, logs it as a platform-wide change and goes back to the list', async () => {
    m.mockPlanCreate.mockResolvedValue({ id: 'plan-1' });

    await createPlanAction(undefined, form(premium));

    const plan = { ...premiumData, monthlyDossierLimit: 20 };
    expect(m.mockPlanCreate).toHaveBeenCalledWith({ data: plan });
    expect(m.mockAuditCreate).toHaveBeenCalledWith({
      data: { superAdminId: 'admin-1', action: 'plan.create', targetCompanyId: null, details: { planId: 'plan-1', ...plan } },
    });
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/plans\?ok=/));
  });

  it('refuses a missing name, an unknown tier, a zero limit and a negative price, all at once', async () => {
    const result = await createPlanAction(undefined, form({ name: ' ', tier: 'GOLD', monthlyDossierLimit: '0', priceTnd: '-1' }));

    expect(result?.error).toContain('Nom');
    expect(result?.error).toContain('Niveau');
    expect(result?.error).toContain('Dossiers par mois');
    expect(result?.error).toContain('Prix');
    expect(m.mockPlanCreate).not.toHaveBeenCalled();
  });

  it('refuses a fractional dossier limit', async () => {
    const result = await createPlanAction(undefined, form({ ...premium, monthlyDossierLimit: '2.5' }));

    expect(result?.error).toContain('nombre entier');
    expect(m.mockPlanCreate).not.toHaveBeenCalled();
  });
});

describe('supplier packs', () => {
  const pack = { audience: 'SUPPLIER', name: 'Pack 50', tier: 'STANDARD', priceTnd: '500', maxSponsoredInstallers: '50', dossiersPerInstallerPerMonth: '8', includesHighlight: 'on' };

  it('stores the pack fields and tier with a neutral monthly limit, ignoring installer-only fields', async () => {
    m.mockPlanCreate.mockResolvedValue({ id: 'pack-1' });

    await createPlanAction(undefined, form({ ...pack, tier: 'PREMIUM', monthlyDossierLimit: '99', isTrial: 'on' }));

    expect(m.mockPlanCreate).toHaveBeenCalledWith({
      data: {
        name: 'Pack 50',
        tier: 'PREMIUM',
        monthlyDossierLimit: 0,
        priceTnd: 500,
        isTrial: false,
        audience: 'SUPPLIER',
        maxSponsoredInstallers: 50,
        dossiersPerInstallerPerMonth: 8,
        includesHighlight: true,
      },
    });
    expect(m.mockPlanFindFirst).not.toHaveBeenCalled();
    expect((m.mockAuditCreate.mock.calls[0]?.[0] as { data: object }).data).toMatchObject({ action: 'plan.create' });
  });

  it('defaults to 5 dossiers per installer and no highlight', async () => {
    m.mockPlanCreate.mockResolvedValue({ id: 'pack-1' });

    await createPlanAction(undefined, form({ audience: 'SUPPLIER', name: 'Pack 100', priceTnd: '900', maxSponsoredInstallers: '100' }));

    expect(m.mockPlanCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ dossiersPerInstallerPerMonth: 5, includesHighlight: false, maxSponsoredInstallers: 100 }) as unknown,
    });
  });

  it('requires the number of installer accounts and refuses a zero quota', async () => {
    const result = await createPlanAction(undefined, form({ ...pack, maxSponsoredInstallers: '', dossiersPerInstallerPerMonth: '0' }));

    expect(result?.error).toContain('Nombre de comptes installateurs');
    expect(result?.error).toContain('Dossiers par installateur');
    expect(m.mockPlanCreate).not.toHaveBeenCalled();
  });

  it('refuses an unknown audience', async () => {
    const result = await createPlanAction(undefined, form({ ...premium, audience: 'ADMIN' }));

    expect(result?.error).toContain('Public');
  });

  it('refuses to switch the audience of a plan companies already hold', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-1', audience: 'INSTALLER', _count: { subscriptions: 2 } });

    const result = await updatePlanAction('plan-1', undefined, form(pack));

    expect(result?.error).toContain('public ne peut plus changer');
    expect(m.mockPlanUpdate).not.toHaveBeenCalled();
  });
});

describe('free trial plan', () => {
  const trial = { name: 'Essai gratuit', tier: 'STANDARD', monthlyDossierLimit: '3', priceTnd: '0', isTrial: 'on' };

  it('creates a trial plan when no other one is offered', async () => {
    m.mockPlanCreate.mockResolvedValue({ id: 'plan-trial' });

    await createPlanAction(undefined, form(trial));

    expect(m.mockPlanFindFirst).toHaveBeenCalledWith({ where: { isTrial: true, archivedAt: null }, select: { id: true } });
    expect(m.mockPlanCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ isTrial: true }) as unknown });
  });

  it('refuses a second non-archived trial plan, on create and on update', async () => {
    m.mockPlanFindFirst.mockResolvedValue({ id: 'plan-trial' });

    const created = await createPlanAction(undefined, form(trial));
    const updated = await updatePlanAction('plan-2', undefined, form(trial));

    expect(created?.error).toContain("plan d'essai gratuit existe déjà");
    expect(updated?.error).toContain("plan d'essai gratuit existe déjà");
    expect(m.mockPlanFindFirst).toHaveBeenLastCalledWith({
      where: { isTrial: true, archivedAt: null, id: { not: 'plan-2' } },
      select: { id: true },
    });
    expect(m.mockPlanCreate).not.toHaveBeenCalled();
    expect(m.mockPlanUpdate).not.toHaveBeenCalled();
  });

  it('does not look for another trial when the plan is not one', async () => {
    m.mockPlanCreate.mockResolvedValue({ id: 'plan-1' });

    await createPlanAction(undefined, form(premium));

    expect(m.mockPlanFindFirst).not.toHaveBeenCalled();
  });

  it('keeps an archived second trial plan archived', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-old', name: 'Essai', isTrial: true, archivedAt: new Date('2026-09-01') });
    m.mockPlanFindFirst.mockResolvedValue({ id: 'plan-trial' });

    await unarchivePlanAction('plan-old');

    expect(m.mockPlanUpdate).not.toHaveBeenCalled();
  });
});

describe('updatePlanAction', () => {
  it('updates the plan in place and logs the new values', async () => {
    await updatePlanAction('plan-1', undefined, form({ ...premium, monthlyDossierLimit: '25' }));

    expect(m.mockPlanUpdate).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { ...premiumData, monthlyDossierLimit: 25 },
    });
    expect((m.mockAuditCreate.mock.calls[0]?.[0] as { data: object }).data).toMatchObject({ action: 'plan.update', details: { planId: 'plan-1', monthlyDossierLimit: 25 } });
  });
});

describe('archivePlanAction / unarchivePlanAction', () => {
  it('archives an offered plan and logs it', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-1', name: 'Premium', archivedAt: null });

    await archivePlanAction('plan-1');

    expect(m.mockPlanUpdate).toHaveBeenCalledWith({ where: { id: 'plan-1' }, data: { archivedAt: expect.any(Date) as unknown } });
    expect(m.mockAuditCreate).toHaveBeenCalledWith({
      data: { superAdminId: 'admin-1', action: 'plan.archive', targetCompanyId: null, details: { planId: 'plan-1', name: 'Premium' } },
    });
    expect(m.mockRedirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/plans\?ok=/));
  });

  it('unarchives an archived plan and logs it', async () => {
    m.mockPlanFindUnique.mockResolvedValue({ id: 'plan-1', name: 'Premium', archivedAt: new Date('2026-09-01') });

    await unarchivePlanAction('plan-1');

    expect(m.mockPlanUpdate).toHaveBeenCalledWith({ where: { id: 'plan-1' }, data: { archivedAt: null } });
    expect((m.mockAuditCreate.mock.calls[0]?.[0] as { data: object }).data).toMatchObject({ action: 'plan.unarchive' });
  });

  it('writes nothing for an unknown plan or one already in the wanted state', async () => {
    m.mockPlanFindUnique.mockResolvedValueOnce(null);
    await archivePlanAction('nope');
    m.mockPlanFindUnique.mockResolvedValueOnce({ id: 'plan-1', name: 'Premium', archivedAt: new Date('2026-09-01') });
    await archivePlanAction('plan-1');
    m.mockPlanFindUnique.mockResolvedValueOnce({ id: 'plan-2', name: 'Standard', archivedAt: null });
    await unarchivePlanAction('plan-2');

    expect(m.mockPlanUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledTimes(3);
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

  it('redirects to /admin/login and never writes a plan', async () => {
    await expect(createPlanAction(undefined, form(premium))).rejects.toThrow(FakeNextRedirect);
    await expect(updatePlanAction('plan-1', undefined, form(premium))).rejects.toThrow(FakeNextRedirect);
    await expect(archivePlanAction('plan-1')).rejects.toThrow(FakeNextRedirect);
    await expect(unarchivePlanAction('plan-1')).rejects.toThrow(FakeNextRedirect);
    expect(m.mockPlanFindUnique).not.toHaveBeenCalled();

    expect(m.mockPlanCreate).not.toHaveBeenCalled();
    expect(m.mockPlanUpdate).not.toHaveBeenCalled();
    expect(m.mockAuditCreate).not.toHaveBeenCalled();
    expect(m.mockRedirect).toHaveBeenCalledWith('/admin/login');
  });
});
