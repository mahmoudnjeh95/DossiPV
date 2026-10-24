import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockRevalidatePath: vi.fn(),
    mockValidateSession: vi.fn(),
    companyFindUnique: vi.fn(),
    subscriptionFindUnique: vi.fn(),
    projectCreate: vi.fn(),
    projectFindFirst: vi.fn(),
    projectUpdate: vi.fn(),
    jobFindMany: vi.fn(),
    jobCreate: vi.fn(),
    sourceDocumentCount: vi.fn(),
    transaction: vi.fn(),
    assignDossierNumber: vi.fn(),
    libraryFindFirst: vi.fn(),
    libraryUpsert: vi.fn(),
    libraryCreateMany: vi.fn(),
    libraryDeleteMany: vi.fn(),
    catalogFindFirst: vi.fn(),
    catalogFindMany: vi.fn(),
    pvModuleCreate: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findUnique: m.companyFindUnique },
      subscription: { findUnique: m.subscriptionFindUnique },
      project: { create: m.projectCreate, findFirst: m.projectFindFirst, update: m.projectUpdate },
      dossierJob: { findMany: m.jobFindMany, create: m.jobCreate },
      catalogSourceDocument: { count: m.sourceDocumentCount },
      libraryItem: { findFirst: m.libraryFindFirst, upsert: m.libraryUpsert, createMany: m.libraryCreateMany, deleteMany: m.libraryDeleteMany },
      inverter: { findFirst: m.catalogFindFirst, findMany: m.catalogFindMany },
      pvModule: { findFirst: m.catalogFindFirst, create: m.pvModuleCreate },
      spd: { findFirst: m.catalogFindFirst, findMany: m.catalogFindMany },
      $transaction: m.transaction,
    },
  };
});
vi.mock('../lib/dossier-number', async () => {
  const actual = await vi.importActual<typeof import('../lib/dossier-number')>('../lib/dossier-number');
  return { ...actual, assignDossierNumber: m.assignDossierNumber };
});

import { addAllOfKindAction, addToLibraryAction, removeFromLibraryAction } from '../app/(app)/library/actions';
import { createOwnEquipmentAction } from '../app/(app)/library/own-equipment-actions';
import { createProjectAction } from '../app/(app)/projects/actions';
import { generateDossierAction } from '../app/(app)/projects/[id]/actions';
import { buildFullProject } from './fixtures/full-project';

const DAY = 24 * 3600 * 1000;
const user = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

/** company-1 is sponsored by supplier-1 (or direct), with the given supplier / own subscription rows. */
function setup(options: { sponsored: boolean; own?: unknown; supplier?: unknown; option3dUntil?: Date | null }): void {
  m.companyFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === 'company-1'
        ? { sponsorCompanyId: options.sponsored ? 'supplier-1' : null, subscription: options.own || options.option3dUntil ? { ...(options.own as object | undefined), option3dUntil: options.option3dUntil ?? null } : null }
        : null,
    ),
  );
  m.subscriptionFindUnique.mockImplementation(({ where }: { where: { companyId: string } }) =>
    Promise.resolve(where.companyId === 'supplier-1' ? (options.supplier ?? null) : null),
  );
}

const standardPlan = { name: 'Standard', monthlyDossierLimit: 10, tier: 'STANDARD' as const, isTrial: false };
const premiumPlan = { name: 'Premium', monthlyDossierLimit: 30, tier: 'PREMIUM' as const, isTrial: false };
const activeRow = (plan: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  status: 'ACTIVE',
  periodStart: new Date(Date.now() - 5 * DAY),
  periodEnd: new Date(Date.now() + 25 * DAY),
  plan,
  ...extra,
});
/** The supplier's pack: its plan figures are the supplier's, the installers get `dossiersPerInstallerPerMonth`. */
const packRow = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
  activeRow({ name: 'Pack 5', monthlyDossierLimit: 999, tier: 'STANDARD', isTrial: false, dossiersPerInstallerPerMonth: 2 }, extra);

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'token' });
  m.mockValidateSession.mockResolvedValue(user);
  m.mockRedirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  m.catalogFindFirst.mockResolvedValue({ id: 'item-1' });
  m.catalogFindMany.mockResolvedValue([{ id: 'spd-2' }]);
  m.libraryFindFirst.mockResolvedValue(null);
  m.libraryDeleteMany.mockResolvedValue({ count: 1 });
  m.jobFindMany.mockResolvedValue([]);
  m.sourceDocumentCount.mockResolvedValue(0);
  m.projectCreate.mockResolvedValue({ id: 'project-9' });
  m.projectFindFirst.mockResolvedValue(buildFullProject());
  m.projectUpdate.mockResolvedValue({});
  m.jobCreate.mockResolvedValue({ id: 'job-1' });
  m.assignDossierNumber.mockResolvedValue('434 - 303');
  m.transaction.mockImplementation((run: (tx: unknown) => Promise<unknown>) =>
    run({ project: { update: m.projectUpdate }, dossierJob: { create: m.jobCreate, count: vi.fn().mockResolvedValue(0) } }),
  );
  setup({ sponsored: false });
});

describe('catalog lock — library', () => {
  it('refuses a sponsored installer adding a panel or an inverter', async () => {
    setup({ sponsored: true, supplier: packRow() });
    const expected = { error: 'Votre fournisseur impose ses panneaux et onduleurs.' };
    expect(await addToLibraryAction('PV_MODULE', 'mod-1')).toEqual(expected);
    expect(await addToLibraryAction('INVERTER', 'inv-1')).toEqual(expected);
    expect(m.libraryUpsert).not.toHaveBeenCalled();
  });

  it('still lets a sponsored installer add any other kind', async () => {
    setup({ sponsored: true, supplier: packRow() });
    expect(await addToLibraryAction('SPD', 'spd-1')).toBeUndefined();
    expect(m.libraryUpsert).toHaveBeenCalledTimes(1);
    expect(await addAllOfKindAction('SPD')).toBeUndefined();
    expect(m.libraryCreateMany).toHaveBeenCalledTimes(1);
  });

  it('lets a direct installer add panels and inverters', async () => {
    expect(await addToLibraryAction('PV_MODULE', 'mod-1')).toBeUndefined();
    expect(await addToLibraryAction('INVERTER', 'inv-1')).toBeUndefined();
    expect(m.libraryUpsert).toHaveBeenCalledTimes(2);
  });

  it('refuses a sponsored installer removing a panel or inverter, but not another kind', async () => {
    setup({ sponsored: true, supplier: packRow() });
    m.libraryFindFirst.mockResolvedValueOnce({ kind: 'INVERTER' });
    expect(await removeFromLibraryAction('li-1')).toEqual({ error: 'Votre fournisseur impose ses panneaux et onduleurs.' });
    expect(m.libraryDeleteMany).not.toHaveBeenCalled();

    m.libraryFindFirst.mockResolvedValueOnce({ kind: 'SPD' });
    expect(await removeFromLibraryAction('li-2')).toBeUndefined();
    expect(m.libraryDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('lets a direct installer remove a panel', async () => {
    expect(await removeFromLibraryAction('li-1')).toBeUndefined();
    expect(m.libraryFindFirst).not.toHaveBeenCalled();
    expect(m.libraryDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('refuses a sponsored installer creating its own equipment', async () => {
    setup({ sponsored: true, supplier: packRow() });
    const result = await createOwnEquipmentAction('PV_MODULE', undefined, form({ brand: 'X' }));
    expect(result?.error).toMatch(/Votre fournisseur impose ses panneaux et onduleurs/);
    expect(m.pvModuleCreate).not.toHaveBeenCalled();
  });
});

describe('with3d at project creation', () => {
  const clientForm = (): FormData => form({ fullName: 'Habib', clientKind: 'residential', civility: 'M.', stegReference: '' });
  const created = (): { data: { tier: string; with3d: boolean } } => m.projectCreate.mock.calls[0]?.[0] as never;

  it('is on for a direct Premium installer and off for a direct Standard one', async () => {
    setup({ sponsored: false, own: activeRow(premiumPlan) });
    await createProjectAction(undefined, clientForm()).catch(() => undefined);
    expect(created().data).toMatchObject({ tier: 'PREMIUM', with3d: true });

    m.projectCreate.mockClear();
    setup({ sponsored: false, own: activeRow(standardPlan) });
    await createProjectAction(undefined, clientForm()).catch(() => undefined);
    expect(created().data).toMatchObject({ tier: 'STANDARD', with3d: false });
  });

  it('is on for a sponsored installer whose 3D option runs and whose supplier is active', async () => {
    setup({ sponsored: true, supplier: packRow(), option3dUntil: new Date(Date.now() + 10 * DAY) });
    await createProjectAction(undefined, clientForm()).catch(() => undefined);
    expect(created().data).toMatchObject({ tier: 'STANDARD', with3d: true });
  });

  it('is off for a sponsored installer without the option, or with an expired one', async () => {
    setup({ sponsored: true, supplier: packRow(), option3dUntil: null });
    await createProjectAction(undefined, clientForm()).catch(() => undefined);
    expect(created().data.with3d).toBe(false);

    m.projectCreate.mockClear();
    setup({ sponsored: true, supplier: packRow(), option3dUntil: new Date(Date.now() - DAY) });
    await createProjectAction(undefined, clientForm()).catch(() => undefined);
    expect(created().data.with3d).toBe(false);
  });

  it('is off when the supplier subscription has lapsed, option or not', async () => {
    setup({ sponsored: true, supplier: packRow({ periodEnd: new Date(Date.now() - DAY) }), option3dUntil: new Date(Date.now() + 10 * DAY) });
    await createProjectAction(undefined, clientForm()).catch(() => undefined);
    expect(created().data.with3d).toBe(false);
  });
});

describe('generation under a supplier subscription', () => {
  it("counts the pack's per-installer quota, not the supplier's pack figure", async () => {
    setup({ sponsored: true, supplier: packRow() });
    m.jobFindMany.mockResolvedValue([
      { projectId: 'a', status: 'SUCCEEDED', startedAt: new Date() },
      { projectId: 'b', status: 'SUCCEEDED', startedAt: new Date() },
    ]);
    expect(await generateDossierAction('project-1', undefined)).toEqual({ error: 'Quota mensuel atteint (2/2 dossiers).' });
    expect(m.jobCreate).not.toHaveBeenCalled();
  });

  it('generates while the supplier subscription is active and the quota is not used up', async () => {
    setup({ sponsored: true, supplier: packRow() });
    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow('NEXT_REDIRECT:/projects/project-1/jobs/job-1');
  });

  it('blocks generation once the supplier subscription has lapsed, with a message naming the supplier', async () => {
    setup({ sponsored: true, supplier: packRow({ periodEnd: new Date(Date.now() - DAY) }) });
    const result = await generateDossierAction('project-1', undefined);
    expect(result?.error).toMatch(/L’abonnement de votre fournisseur a expiré : payez Standard ou Premium vous-même/);
    expect(m.jobCreate).not.toHaveBeenCalled();
  });

  it('keeps a direct installer on its own subscription', async () => {
    setup({ sponsored: false, own: activeRow(standardPlan) });
    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow('NEXT_REDIRECT:/projects/project-1/jobs/job-1');
  });
});
