import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseProjectFilters, projectHref, projectListWhere, projectStepLabel } from '../lib/project-list';

const m = vi.hoisted(() => {
  const tx = {
    project: { findFirst: vi.fn(), delete: vi.fn() },
    projectArrayMppt: { deleteMany: vi.fn() },
    projectArrayInverter: { deleteMany: vi.fn() },
    projectArrayConfig: { deleteMany: vi.fn() },
    projectProtections: { deleteMany: vi.fn() },
    projectCableRun: { deleteMany: vi.fn() },
    projectCablingConfig: { deleteMany: vi.fn() },
    projectStructure: { deleteMany: vi.fn() },
    projectEarthing: { deleteMany: vi.fn() },
    projectSimulation: { deleteMany: vi.fn() },
    projectImagery: { deleteMany: vi.fn() },
    projectOffGrid: { deleteMany: vi.fn() },
    projectAnnexExtraFile: { deleteMany: vi.fn() },
    projectAnnexes: { deleteMany: vi.fn() },
    projectBillImport: { deleteMany: vi.fn() },
    projectClient: { deleteMany: vi.fn() },
    projectSite: { deleteMany: vi.fn() },
  };
  return {
    tx,
    mockCookies: vi.fn(() => Promise.resolve({ get: () => ({ value: 'valid-token' }) })),
    mockRedirect: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockValidateSession: vi.fn(),
    mockUpdateMany: vi.fn(),
    mockFileDelete: vi.fn(),
    mockDeleteFile: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('@dossipv/file-storage', () => ({ deleteFile: m.mockDeleteFile }));
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
      company: { findUnique: (): Promise<{ kind: string }> => Promise.resolve({ kind: 'INSTALLER' }) },
      project: { updateMany: m.mockUpdateMany },
      file: { delete: m.mockFileDelete },
      $transaction: (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(m.tx),
    },
  };
});

import { deleteProjectAction, setProjectArchivedAction } from '../app/(app)/projects/actions';

beforeEach(() => {
  vi.clearAllMocks();
  m.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' });
});

describe('projectHref', () => {
  it('reopens a project on the step it is waiting on', () => {
    expect(projectHref({ id: 'p1', flowStep: 'PROPOSALS' })).toBe('/projects/p1/proposals');
    expect(projectHref({ id: 'p1', flowStep: 'LOCATIONS' })).toBe('/projects/p1/locations');
    expect(projectHref({ id: 'p1', flowStep: 'READY' })).toBe('/projects/p1');
    expect(projectHref({ id: 'p1', flowStep: null })).toBe('/projects/p1');
  });

  it('labels only the steps of a draft', () => {
    expect(projectStepLabel({ flowStep: 'PROPOSALS', status: 'DRAFT' })).toBe('installation à choisir');
    expect(projectStepLabel({ flowStep: 'PROPOSALS', status: 'GENERATED' })).toBeNull();
  });
});

describe('project list filters', () => {
  it('defaults to the projects in progress and ignores unknown values', () => {
    expect(parseProjectFilters({ status: 'NOPE', view: 'x' })).toEqual({ q: '', status: null, view: 'active' });
    expect(projectListWhere('c1', parseProjectFilters({}))).toEqual({ AND: [{ companyId: 'c1' }, { archivedAt: null }] });
  });

  it('filters a step as a draft on that step, and searches the client and dossier number', () => {
    const where = projectListWhere('c1', parseProjectFilters({ q: ' Ben ', status: 'PROPOSALS', view: 'archived' }));
    const contains = { contains: 'Ben', mode: 'insensitive' };
    expect(where).toEqual({
      AND: [
        { companyId: 'c1' },
        { archivedAt: { not: null } },
        { status: 'DRAFT', flowStep: 'PROPOSALS' },
        {
          OR: [
            { client: { fullName: contains } },
            { client: { stegReference: contains } },
            { client: { city: contains } },
            { dossierNumber: contains },
          ],
        },
      ],
    });
  });

  it('shows every project with the "all" view', () => {
    expect(projectListWhere('c1', parseProjectFilters({ view: 'all', status: 'GENERATED' }))).toEqual({
      AND: [{ companyId: 'c1' }, { status: 'GENERATED' }],
    });
  });
});

describe('setProjectArchivedAction', () => {
  it("archives only a project of the caller's company", async () => {
    m.mockUpdateMany.mockResolvedValue({ count: 1 });
    expect(await setProjectArchivedAction('p1', true)).toBeUndefined();
    expect(m.mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'p1', companyId: 'company-1' },
      data: { archivedAt: expect.any(Date) as Date },
    });
  });

  it('restores a project and reports one it cannot find', async () => {
    m.mockUpdateMany.mockResolvedValue({ count: 0 });
    expect(await setProjectArchivedAction('p1', false)).toEqual({ error: 'Projet introuvable.' });
    expect(m.mockUpdateMany.mock.calls[0]?.[0]).toMatchObject({ data: { archivedAt: null } });
  });
});

describe('deleteProjectAction', () => {
  const project = {
    id: 'p1',
    _count: { jobs: 0 },
    site: { siteImageFileId: null },
    structure: null,
    simulation: { pvsystReportFileId: null },
    imagery: null,
    billImport: { fileId: 'bill' },
    annexes: {
      cinFileId: 'cin',
      commercialRegisterFileId: null,
      stegContractFileId: null,
      lastPaidBillFileId: 'bill',
      moduleAcceptanceFileId: null,
      syndicAuthorizationFileId: null,
      extraFiles: [{ fileId: 'extra' }],
    },
  };

  it('refuses a project that had a dossier launched', async () => {
    m.tx.project.findFirst.mockResolvedValue({ ...project, _count: { jobs: 1 } });
    expect(await deleteProjectAction('p1')).toEqual({ error: expect.stringContaining('archivez-le') as string });
    expect(m.tx.project.delete).not.toHaveBeenCalled();
  });

  it("refuses another company's project", async () => {
    m.tx.project.findFirst.mockResolvedValue(null);
    expect(await deleteProjectAction('p1')).toEqual({ error: 'Projet introuvable.' });
    expect(m.tx.project.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'p1', companyId: 'company-1' } });
  });

  it('deletes the project, its sections and each of its files once', async () => {
    m.tx.project.findFirst.mockResolvedValue(project);
    m.mockFileDelete.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ storageKey: `key-${where.id}` }));

    expect(await deleteProjectAction('p1')).toBeUndefined();
    expect(m.tx.projectClient.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } });
    expect(m.tx.projectAnnexExtraFile.deleteMany).toHaveBeenCalledWith({ where: { annexes: { projectId: 'p1' } } });
    expect(m.tx.project.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(m.mockFileDelete.mock.calls.map(([arg]) => (arg as { where: { id: string } }).where.id).sort()).toEqual(['bill', 'cin', 'extra']);
    expect(m.mockDeleteFile).toHaveBeenCalledTimes(3);
  });

  it('keeps the bytes of a file another row still points at', async () => {
    m.tx.project.findFirst.mockResolvedValue({ ...project, annexes: null, billImport: { fileId: 'bill' } });
    m.mockFileDelete.mockRejectedValue(new Error('foreign key'));

    expect(await deleteProjectAction('p1')).toBeUndefined();
    expect(m.mockDeleteFile).not.toHaveBeenCalled();
  });
});
