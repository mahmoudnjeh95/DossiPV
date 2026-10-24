import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockValidateSession: vi.fn(),
    projectFindFirst: vi.fn(),
    projectUpdate: vi.fn(),
    subscriptionFindUnique: vi.fn(),
    jobFindMany: vi.fn(),
    jobCreate: vi.fn(),
    transaction: vi.fn(),
    assignDossierNumber: vi.fn(),
    sourceDocumentCount: vi.fn(),
    txJobCount: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mocks.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mocks.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      project: { findFirst: mocks.projectFindFirst, update: mocks.projectUpdate },
      subscription: { findUnique: mocks.subscriptionFindUnique },
      company: { findUnique: (): Promise<unknown> => (mocks.subscriptionFindUnique as () => Promise<unknown>)().then((subscription) => ({ sponsorCompanyId: null, subscription })) },
      dossierJob: { findMany: mocks.jobFindMany, create: mocks.jobCreate },
      catalogSourceDocument: { count: mocks.sourceDocumentCount },
      $transaction: mocks.transaction,
    },
  };
});

vi.mock('../lib/dossier-number', async () => {
  const actual = await vi.importActual<typeof import('../lib/dossier-number')>('../lib/dossier-number');
  return { ...actual, assignDossierNumber: mocks.assignDossierNumber };
});

import { generateDossierAction } from '../app/(app)/projects/[id]/actions';
import { buildFullProject } from './fixtures/full-project';
import { monthStart } from '../lib/subscription';

const user = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'a@b.com',
  fullName: 'A',
  role: 'OWNER' as const,
};
const activeSubscription = {
  status: 'ACTIVE',
  periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  plan: { name: 'Standard', monthlyDossierLimit: 10, tier: 'STANDARD' },
};

/** The interactive transaction's client: the same mocks, so call assertions stay simple. */
const tx = {
  project: { update: mocks.projectUpdate },
  dossierJob: { create: mocks.jobCreate, count: mocks.txJobCount },
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
    }
  }
  mocks.mockGet.mockReturnValue({ value: 'valid-token' });
  mocks.mockCookies.mockImplementation(() => Promise.resolve({ get: mocks.mockGet }));
  mocks.mockValidateSession.mockResolvedValue(user);
  mocks.projectFindFirst.mockResolvedValue(buildFullProject());
  mocks.subscriptionFindUnique.mockResolvedValue(activeSubscription);
  mocks.jobFindMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation((run: (tx: unknown) => Promise<unknown>) => run(tx));
  mocks.assignDossierNumber.mockResolvedValue('434 - 303');
  mocks.jobCreate.mockResolvedValue({ id: 'job-1' });
  mocks.projectUpdate.mockResolvedValue({});
  mocks.sourceDocumentCount.mockResolvedValue(0);
  mocks.txJobCount.mockResolvedValue(0);
  mocks.mockRedirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

const JOB_PAGE = 'NEXT_REDIRECT:/projects/project-1/jobs/job-1';

/** The snapshot of the one job the action created. */
function createdSnapshot(): Record<string, unknown> {
  const data = mocks.jobCreate.mock.calls[0]?.[0] as { data: { inputSnapshot: Record<string, unknown> } };
  return data.data.inputSnapshot;
}

describe('generateDossierAction', () => {
  it('refuses a project from another company', async () => {
    mocks.projectFindFirst.mockResolvedValue(null);
    expect(await generateDossierAction('x', undefined)).toEqual({ error: 'Projet introuvable.' });
    expect(mocks.projectFindFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'x', companyId: 'company-1' },
    });
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it('refuses to generate with generic equipment', async () => {
    const project = buildFullProject();
    const protections = project.protections!;
    mocks.projectFindFirst.mockResolvedValue({
      ...project,
      protections: { ...protections, acSpd: { ...protections.acSpd, brand: 'Generic', model: 'AC-SPD-1', datasheetSourceUrl: null, ownerCompanyId: null } },
    });
    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: 'Équipement sans fiche technique : Generic AC-SPD-1. Remplacez-le avant de générer.',
    });
    expect(mocks.jobFindMany).not.toHaveBeenCalled();
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it('refuses to generate without the ANME agreement', async () => {
    const project = buildFullProject();
    mocks.projectFindFirst.mockResolvedValue({ ...project, company: { ...project.company, anmeCertificateFileId: null } });

    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: "Ajoutez l'attestation d'agrément ANME de votre société dans Paramètres avant de générer.",
    });
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it('refuses when the subscription is expired', async () => {
    mocks.subscriptionFindUnique.mockResolvedValue({
      ...activeSubscription,
      periodEnd: new Date('2020-01-01'),
    });
    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: "Votre abonnement n'est pas actif : génération impossible.",
    });
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it('refuses when the monthly quota is used up by other projects', async () => {
    mocks.subscriptionFindUnique.mockResolvedValue({
      ...activeSubscription,
      plan: { ...activeSubscription.plan, monthlyDossierLimit: 1 },
    });
    mocks.jobFindMany.mockResolvedValue([
      { projectId: 'other', status: 'SUCCEEDED', startedAt: new Date() },
    ]);
    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: 'Quota mensuel atteint (1/1 dossiers).',
    });
  });

  describe('free trial', () => {
    const periodStart = new Date('2026-08-01T00:00:00Z');
    const trialSubscription = {
      status: 'ACTIVE',
      periodStart,
      periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      plan: { name: 'Essai gratuit', monthlyDossierLimit: 3, tier: 'STANDARD', isTrial: true },
    };

    it('counts the dossiers over the whole period: jobs from earlier months use up the quota', async () => {
      mocks.subscriptionFindUnique.mockResolvedValue(trialSubscription);
      const jobs = ['a', 'b', 'c'].map((projectId) => ({ projectId, status: 'SUCCEEDED', startedAt: new Date('2026-08-15T00:00:00Z') }));
      mocks.jobFindMany.mockResolvedValue(jobs);

      const result = await generateDossierAction('project-1', undefined);

      expect(result?.error).toMatch(/^Essai gratuit terminé \(3 dossiers utilisés\) : contactez SolarixPro/);
      expect(mocks.jobFindMany.mock.calls[0]?.[0]).toMatchObject({
        where: { project: { companyId: 'company-1' }, startedAt: { gte: periodStart } },
      });
      expect(mocks.jobCreate).not.toHaveBeenCalled();
    });

    it('lets an already counted project be regenerated when the trial quota is used', async () => {
      mocks.subscriptionFindUnique.mockResolvedValue(trialSubscription);
      mocks.jobFindMany.mockResolvedValue(
        ['project-1', 'b', 'c'].map((projectId) => ({ projectId, status: 'SUCCEEDED', startedAt: new Date('2026-08-15T00:00:00Z') })),
      );

      await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);
    });

    it('does not count failed jobs', async () => {
      mocks.subscriptionFindUnique.mockResolvedValue(trialSubscription);
      mocks.jobFindMany.mockResolvedValue(
        ['a', 'b', 'c'].map((projectId) => ({ projectId, status: 'FAILED', startedAt: new Date('2026-08-15T00:00:00Z') })),
      );

      await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);
    });

    it('a regular plan still counts per calendar month', async () => {
      await generateDossierAction('project-1', undefined).catch(() => undefined);

      const where = (mocks.jobFindMany.mock.calls[0]?.[0] as { where: { startedAt: { gte: Date } } }).where;
      expect(where.startedAt.gte).toEqual(monthStart(new Date()));
    });

    it('refuses once the trial period is over, with the trial wording', async () => {
      mocks.subscriptionFindUnique.mockResolvedValue({ ...trialSubscription, periodEnd: new Date('2026-09-01T00:00:00Z') });

      const result = await generateDossierAction('project-1', undefined);

      expect(result?.error).toMatch(/^Essai gratuit expiré : contactez SolarixPro/);
      expect(mocks.jobCreate).not.toHaveBeenCalled();
    });
  });

  describe('incomplete company profile', () => {
    it('refuses to generate and points to Paramètres', async () => {
      const project = buildFullProject();
      mocks.projectFindFirst.mockResolvedValue({ ...project, company: { ...project.company, profileComplete: false } });

      const result = await generateDossierAction('project-1', undefined);

      expect(result?.error).toMatch(/^Complétez le profil de votre société dans Paramètres : adresse, représentant légal, agrément ANME/);
      expect(mocks.jobCreate).not.toHaveBeenCalled();
    });

    it('generates once the profile is complete', async () => {
      await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);
    });
  });

  it('refuses while a job is already pending for the project', async () => {
    mocks.projectFindFirst.mockResolvedValue(
      buildFullProject({
        jobs: [
          {
            id: 'j',
            projectId: 'project-1',
            status: 'PENDING',
            failedStep: null,
            failureReason: null,
            progressStep: null,
            progressAt: null,
            inputSnapshot: {},
            startedAt: new Date(),
            completedAt: null,
            docxFileId: null,
            pdfFileId: null,
            annexesPdfFileId: null,
            warnings: [],
          },
        ],
      }),
    );
    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: 'Une génération est déjà en cours pour ce projet.',
    });
  });

  it('refuses a double submit that finds a job queued meanwhile, under the project lock', async () => {
    mocks.txJobCount.mockResolvedValue(1);

    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: 'Une génération est déjà en cours pour ce projet.',
    });
    expect(mocks.txJobCount).toHaveBeenCalledWith({ where: { projectId: 'project-1', status: { in: ['PENDING', 'RUNNING'] } } });
    // Checked after the number's row lock is taken, so two submits cannot both pass.
    expect(mocks.assignDossierNumber.mock.invocationCallOrder[0]).toBeLessThan(mocks.txJobCount.mock.invocationCallOrder[0]!);
    expect(mocks.jobCreate).not.toHaveBeenCalled();
    expect(mocks.mockRedirect).not.toHaveBeenCalled();
  });

  it('refuses an incomplete project and names what is missing', async () => {
    mocks.projectFindFirst.mockResolvedValue(buildFullProject({ structure: null }));
    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: 'Dossier incomplet : Structure : section non renseignée.',
    });
  });

  it('refuses a design with a blocking check failure', async () => {
    const project = buildFullProject();
    project.arrayConfig!.inverters[0]!.mppts[0]!.modulesPerString = 40; // string Voc far above Vdc max → C01 BLOCK
    mocks.projectFindFirst.mockResolvedValue(project);
    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: 'Des contrôles bloquants ont échoué : corrigez-les avant de générer.',
    });
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it('surfaces the engine error for a non-default tilt without stability coefficients', async () => {
    const project = buildFullProject();
    project.site!.tiltDeg = 20;
    mocks.projectFindFirst.mockResolvedValue(project);
    const result = await generateDossierAction('project-1', undefined);
    expect(result?.error).toContain('liftCoeffNPerM2 and dragCoeffNPerM2');
  });

  it.each(['PROPOSALS', 'LOCATIONS'] as const)('refuses a %s project whose points are not saved yet', async (flowStep) => {
    mocks.projectFindFirst.mockResolvedValue(buildFullProject({ flowStep }));

    expect(await generateDossierAction('project-1', undefined)).toEqual({
      error: 'Les longueurs de câble et la mise à la terre ne sont pas encore confirmées : placez les points sur la carte avant de générer.',
    });
    expect(mocks.assignDossierNumber).not.toHaveBeenCalled();
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it('generates a READY project and a manually created one (no flow step)', async () => {
    mocks.projectFindFirst.mockResolvedValue(buildFullProject({ flowStep: 'READY' }));
    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);

    mocks.projectFindFirst.mockResolvedValue(buildFullProject({ flowStep: null }));
    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);
    expect(mocks.jobCreate).toHaveBeenCalledTimes(2);
  });

  it('snapshots the missing STEG pieces as draftMissing', async () => {
    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);

    expect(createdSnapshot().draftMissing).toEqual([
      'Dernière facture STEG acquittée',
      "Matricule fiscal de l'installateur",
      'Acceptation ANME du module',
      'Fiches techniques de tous les équipements',
      "Points GPS du plan d'implantation",
    ]);
    expect(mocks.sourceDocumentCount).toHaveBeenCalledWith({ where: { kind: 'ANME_PANEL_LIST' } });
  });

  it('counts the stored ANME list as the module acceptance', async () => {
    mocks.sourceDocumentCount.mockResolvedValue(1);

    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);

    expect(createdSnapshot().draftMissing).not.toContain('Acceptation ANME du module');
  });

  it('enqueues a PENDING job carrying the frozen engine input and opens the job page', async () => {
    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);

    expect(mocks.jobCreate).toHaveBeenCalledTimes(1);
    const data = mocks.jobCreate.mock.calls[0]?.[0] as {
      data: { projectId: string; status: string; inputSnapshot: Record<string, unknown> };
    };
    expect(data.data.projectId).toBe('project-1');
    expect(data.data.status).toBe('PENDING');
    expect(data.data.inputSnapshot).toMatchObject({
      version: 1,
      projectId: 'project-1',
      companyId: 'company-1',
      tier: 'STANDARD',
    });
    expect(data.data.inputSnapshot.engineInput).toMatchObject({ tMinC: -10, tMaxC: 85 });
    expect(data.data.inputSnapshot.projectMeta).toMatchObject({ earthRodCount: 3 });
    // Equipment captured by value (worker's ProjectSnapshot contract), not just by id.
    expect(data.data.inputSnapshot.arrayConfig).toMatchObject({
      module: { brand: 'LONGi', pmaxW: 620 },
    });
    expect(data.data.inputSnapshot.protections).toMatchObject({ dcSpd: { iscpvKA: 0.02 } });
    expect(data.data.inputSnapshot.cableRuns).toMatchObject([
      { cable: { sections: [{ izA: 56 }] } },
      { cable: { model: 'U-1000 R2V' } },
    ]);
    expect(data.data.inputSnapshot.earthing).toMatchObject({
      earthCable: { model: 'H07V-U', sections: [{ sectionMm2: 16 }] },
    });
    expect(data.data.inputSnapshot).toHaveProperty('capturedAt');
    expect(JSON.parse(JSON.stringify(data.data.inputSnapshot))).toMatchObject({
      earthing: { rodCount: 3 },
    });
    expect(mocks.projectUpdate).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { dossierDate: expect.any(Date) as Date },
    });
    expect(mocks.mockRedirect).toHaveBeenCalledWith('/projects/project-1/jobs/job-1');
  });

  it('assigns the installer dossier number inside the transaction and snapshots it', async () => {
    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);

    expect(mocks.assignDossierNumber).toHaveBeenCalledTimes(1);
    expect(mocks.assignDossierNumber).toHaveBeenCalledWith(tx, 'company-1', 'project-1');
    expect(mocks.assignDossierNumber.mock.invocationCallOrder[0]).toBeLessThan(mocks.jobCreate.mock.invocationCallOrder[0]!);
    const data = mocks.jobCreate.mock.calls[0]?.[0] as { data: { inputSnapshot: Record<string, unknown> } };
    expect(data.data.inputSnapshot.dossierNumber).toBe('434 - 303');
  });

  it('does not take a number when the generation is refused', async () => {
    mocks.projectFindFirst.mockResolvedValue(buildFullProject({ structure: null }));

    await generateDossierAction('project-1', undefined);

    expect(mocks.assignDossierNumber).not.toHaveBeenCalled();
  });

  it('snapshots the consumption from the bill import', async () => {
    const project = buildFullProject();
    project.client!.annualConsumptionKWh = 2400;
    project.billImport = {
      annualConsumptionKWh: 2400,
      reading: {
        lines: [],
        totalElectricityKWh: 1200,
        monthsBilled: null,
        periodStart: '2026-01-01',
        periodEnd: '2026-06-30',
      },
    } as unknown as typeof project.billImport;
    mocks.projectFindFirst.mockResolvedValue(project);

    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);

    const data = mocks.jobCreate.mock.calls[0]?.[0] as { data: { inputSnapshot: Record<string, unknown> } };
    expect(data.data.inputSnapshot.consumption).toEqual({
      annualConsumptionKWh: 2400,
      source: 'BILL',
      billedKWh: 1200,
      monthsBilled: 6,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    });
  });

  it('marks a typed consumption as MANUAL', async () => {
    const project = buildFullProject();
    project.client!.annualConsumptionKWh = 3000;
    project.billImport = {
      annualConsumptionKWh: 2400,
      reading: { lines: [], totalElectricityKWh: 1200, monthsBilled: 6, periodStart: null, periodEnd: null },
    } as unknown as typeof project.billImport;
    mocks.projectFindFirst.mockResolvedValue(project);

    await expect(generateDossierAction('project-1', undefined)).rejects.toThrow(JOB_PAGE);

    const data = mocks.jobCreate.mock.calls[0]?.[0] as { data: { inputSnapshot: Record<string, unknown> } };
    expect(data.data.inputSnapshot.consumption).toEqual({
      annualConsumptionKWh: 3000,
      source: 'MANUAL',
      billedKWh: null,
      monthsBilled: null,
      periodStart: null,
      periodEnd: null,
    });
  });
});
