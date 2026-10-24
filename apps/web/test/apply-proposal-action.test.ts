import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sizingCatalog } from '../../../packages/engine/test/fixtures/sizing-catalog';
import { buildFullProject } from './fixtures/full-project';
import type { ProjectForEngine } from '../lib/project-engine-input';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockTransaction: vi.fn(),
    mockGetSpecificYield: vi.fn(),
    mockLoadSizingCatalog: vi.fn(),
    tx: {
      projectArrayConfig: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
      projectArrayInverter: { deleteMany: vi.fn() },
      projectArrayMppt: { deleteMany: vi.fn() },
      projectProtections: { upsert: vi.fn() },
      projectCablingConfig: { upsert: vi.fn() },
      projectCableRun: { deleteMany: vi.fn(), createMany: vi.fn() },
      projectStructure: { upsert: vi.fn() },
      projectEarthing: { upsert: vi.fn() },
      projectSimulation: { upsert: vi.fn() },
      project: { update: vi.fn() },
    },
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: { ...actual.db, company: { findUnique: () => Promise.resolve({ kind: 'INSTALLER' }) }, project: { findFirst: m.mockProjectFindFirst }, $transaction: m.mockTransaction },
  };
});
// No highlighted product here: the sponsored pass has its own tests (highlighted-proposals.test.ts).
vi.mock('../lib/highlight', async () => {
  const actual = await vi.importActual<typeof import('../lib/highlight')>('../lib/highlight');
  return { ...actual, loadHighlightedProducts: vi.fn().mockResolvedValue({ moduleIds: [], inverterIds: [], suppliers: {}, productIds: {} }) };
});
vi.mock('../lib/sponsorship', async () => {
  const actual = await vi.importActual<typeof import('../lib/sponsorship')>('../lib/sponsorship');
  return { ...actual, isSponsored: vi.fn().mockResolvedValue(false) };
});
vi.mock('../lib/specific-yield', () => ({ getSpecificYield: m.mockGetSpecificYield }));
vi.mock('../lib/sizing-catalog', async () => {
  const actual = await vi.importActual<typeof import('../lib/sizing-catalog')>('../lib/sizing-catalog');
  return { ...actual, loadSizingCatalog: m.mockLoadSizingCatalog };
});

import { applyProposalAction } from '../app/(app)/projects/[id]/proposals/actions';
import { computeProjectProposals } from '../lib/project-proposals';

const user = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };
const NOW = new Date('2026-10-21T10:00:00Z');

/** A project fresh from a STEG bill: client need and site known, no technical section yet. */
function billProject(): ProjectForEngine {
  const base = buildFullProject();
  return {
    ...base,
    id: 'p1',
    flowStep: 'PROPOSALS',
    company: { ...base.company, anmeValidTo: new Date('2028-01-01') },
    client: { ...base.client!, projectId: 'p1', annualConsumptionKWh: 3000, subscribedPowerKVA: 4 },
    arrayConfig: null,
    protections: null,
    cablingConfig: null,
    cableRuns: [],
    structure: null,
    earthing: null,
    simulation: null,
  };
}

function firstCallData(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  return (mock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
}

async function firstProposalKey(): Promise<string> {
  const computed = await computeProjectProposals(billProject(), NOW);
  if (!computed.ok) throw new Error('Expected proposals');
  const first = computed.result.proposals[0];
  if (!first) throw new Error('Expected at least one proposal');
  return first.key;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'valid-token' });
  m.mockValidateSession.mockResolvedValue(user);
  m.mockProjectFindFirst.mockImplementation((args: { where: { companyId: string }; select?: unknown }) => {
    if (args.where.companyId !== 'company-1') return Promise.resolve(null);
    return Promise.resolve(
      args.select ? { id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' } : billProject(),
    );
  });
  m.mockGetSpecificYield.mockResolvedValue({ value: 1600, warning: null });
  m.mockLoadSizingCatalog.mockResolvedValue(sizingCatalog);
  m.mockTransaction.mockImplementation((fn: (tx: typeof m.tx) => Promise<unknown>) => fn(m.tx));
  m.tx.projectArrayConfig.findUnique.mockResolvedValue({ id: 'old-array' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeProjectProposals', () => {
  it('reports the missing need instead of sizing', async () => {
    const project = billProject();
    const computed = await computeProjectProposals(
      { ...project, client: { ...project.client!, subscribedPowerKVA: null }, site: null },
      NOW,
    );

    expect(computed.ok).toBe(false);
    if (computed.ok) return;
    expect(computed.missing).toHaveLength(2);
    expect(m.mockGetSpecificYield).not.toHaveBeenCalled();
  });

  it('builds the context from the company defaults and the default run lengths', async () => {
    const computed = await computeProjectProposals(billProject(), NOW);

    expect(computed.ok).toBe(true);
    if (!computed.ok) return;
    expect(m.mockLoadSizingCatalog).toHaveBeenCalledWith('company-1');
    expect(m.mockGetSpecificYield).toHaveBeenCalledWith(36.5606, 10.5272, 30, 0);
    expect(computed.context).toEqual({
      annualConsumptionKWh: 3000,
      subscribedPowerKVA: 4,
      specificYieldKWhPerKWp: 1600,
      averagePriceTNDPerKWh: null,
      tMinC: -10,
      tMaxC: 85,
      cosPhi: 0.8,
      lambdaOhmPerM: 0.00008,
      maxVoltageDropPct: 3,
      maxAcVoltageDropPct: 1,
      dcLengthM: 15,
      acLengthM: 10,
      windSpeedKmh: 120,
      tiltDeg: 30,
      gps: { lat: 36.5606, lon: 10.5272 },
      dossierDate: '2026-10-21',
      companyAccreditationValidTo: '2028-01-01',
    });
    expect(computed.yieldWarning).toBeNull();
    expect(computed.result.proposals.length).toBeGreaterThan(0);
  });

  it('does not size a three-phase site or one with a lightning rod', async () => {
    const project = billProject();
    const computed = await computeProjectProposals(
      { ...project, site: { ...project.site!, phases: 3, lightningRod: true } },
      NOW,
    );

    expect(computed).toEqual({
      ok: false,
      missing: [],
      missingLibraryKinds: [],
      blockedReasons: [
        'Le site doit être monophasé (abonné BT monophasé) pour les propositions automatiques.',
        'Un paratonnerre est déclaré sur le site : des parafoudres de type 1 sont requis, les propositions automatiques ne le gèrent pas encore.',
      ],
    });
    expect(m.mockGetSpecificYield).not.toHaveBeenCalled();
  });

  it('does not size when the library lacks a kind of equipment', async () => {
    m.mockLoadSizingCatalog.mockResolvedValue({ ...sizingCatalog, acBreakers: [] });

    const computed = await computeProjectProposals(billProject(), NOW);

    expect(computed).toEqual({ ok: false, missing: [], missingLibraryKinds: ['Disjoncteurs différentiels AC 30 mA (type A)'], blockedReasons: [] });
    expect(m.mockGetSpecificYield).not.toHaveBeenCalled();
  });
});

describe('applyProposalAction', () => {
  it('guards before recomputing', async () => {
    m.mockValidateSession.mockResolvedValue(null);

    await expect(applyProposalAction('p1', 'any-key')).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(m.mockProjectFindFirst).not.toHaveBeenCalled();
    expect(m.mockLoadSizingCatalog).not.toHaveBeenCalled();
    expect(m.mockGetSpecificYield).not.toHaveBeenCalled();
  });

  it('refuses an unknown key without writing', async () => {
    const result = await applyProposalAction('p1', 'module-450w|inverter-2kw|99x9');

    expect(result).toEqual({ error: 'Les propositions ont changé : rechargez la page.' });
    expect(m.mockTransaction).not.toHaveBeenCalled();
    expect(m.mockRedirect).not.toHaveBeenCalled();
  });

  it('writes every section and moves to the locations step', async () => {
    const computed = await computeProjectProposals(billProject(), NOW);
    if (!computed.ok) throw new Error('Expected proposals');
    const proposal = computed.result.proposals[0]!;
    const { candidate } = proposal;

    await expect(applyProposalAction('p1', proposal.key)).rejects.toThrow('NEXT_REDIRECT:/projects/p1/locations');

    expect(m.mockTransaction).toHaveBeenCalledTimes(1);
    expect(m.tx.projectArrayConfig.delete).toHaveBeenCalledWith({ where: { id: 'old-array' } });
    // Foreign keys: MPPTs, then their inverters, then the config, then the new config.
    const order = [
      m.tx.projectArrayMppt.deleteMany,
      m.tx.projectArrayInverter.deleteMany,
      m.tx.projectArrayConfig.delete,
      m.tx.projectArrayConfig.create,
    ].map((fn) => fn.mock.invocationCallOrder[0]!);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(firstCallData(m.tx.projectArrayConfig.create)).toEqual({
      projectId: 'p1',
      moduleId: candidate.module.id,
      tMinC: -10,
      tMaxC: 85,
      rowsDescription: null,
      inverters: {
        create: [
          {
            inverterId: candidate.inverter.id,
            phaseConnection: null,
            mppts: { create: candidate.mppts.map((mppt) => ({ stringsInParallel: mppt.stringsInParallel, modulesPerString: mppt.modulesPerString })) },
          },
        ],
      },
    });
    const appliedProtections = {
      dcSpdId: candidate.dcSpdId,
      dcSwitchId: candidate.dcSwitchId,
      dcFuseId: candidate.dcFuseId,
      acBreakerId: candidate.acBreakerId,
      acSpdId: candidate.acSpdId,
      acIsolatorId: null,
      // The values the proposal was sized with, set explicitly so an earlier manual edit is overwritten.
      equipmentImpulseWithstandKV: 4,
      spdToEquipmentDistanceM: 1,
    };
    expect(m.tx.projectProtections.upsert).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      create: { projectId: 'p1', ...appliedProtections },
      update: appliedProtections,
    });
    expect(m.tx.projectCablingConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { cosPhi: 0.8, lambdaOhmPerM: 0.00008, maxVoltageDropPct: 3, maxAcVoltageDropPct: 1 } }),
    );
    expect(m.tx.projectCableRun.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1' } });
    expect(firstCallData(m.tx.projectCableRun.createMany)).toEqual([
      {
        projectId: 'p1', circuitType: 'DC', label: 'Champ PV → onduleur',
        cableId: candidate.dcCable.cableId, sectionMm2: candidate.dcCable.sectionMm2, lengthM: 15,
        installMethod: '13', ambientContext: 'TRAY_SUN', groupedCircuits: 1, layers: 1,
      },
      {
        projectId: 'p1', circuitType: 'AC', label: 'Onduleur → compteur STEG',
        cableId: candidate.acCable.cableId, sectionMm2: candidate.acCable.sectionMm2, lengthM: 10,
        installMethod: '3A', ambientContext: 'TECHNICAL_ROOM', groupedCircuits: 1, layers: 1,
      },
    ]);
    expect(m.tx.projectStructure.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ material: 'ALUMINIUM', windSpeedKmh: 120, frameCount: null, heightHM: null }) as unknown,
      }),
    );
    expect(m.tx.projectEarthing.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          earthCableId: candidate.earthCableId,
          distributionBlockId: null,
          mainEarthSectionMm2: 16,
          frameEarthSectionMm2: 16,
          earthToPitSectionMm2: 25,
          rodCount: 1,
          useBuildingEarth: false,
          rodLengthM: 1.5,
          rodSpacingCm: null,
          pitSizeCm: null,
          targetResistanceOhm: 25,
        },
      }),
    );
    const simulation = {
      source: 'PVGIS_LIVE',
      pvsystReportFileId: null,
      annualProductionKWh: null,
      specificYieldKWhPerKWp: null,
      performanceRatioPct: null,
      systemLossesPct: null,
    };
    expect(m.tx.projectSimulation.upsert).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      create: { projectId: 'p1', ...simulation },
      update: simulation,
    });
    expect(m.tx.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { flowStep: 'LOCATIONS' } });
  });

  it("uses the company's earth resistance target when it has one", async () => {
    const key = await firstProposalKey();
    m.mockProjectFindFirst.mockImplementation((args: { select?: unknown }) => {
      const project = billProject();
      return Promise.resolve(
        args.select
          ? { id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' }
          : { ...project, company: { ...project.company, defaultEarthResistanceTargetOhm: 10 } },
      );
    });

    await expect(applyProposalAction('p1', key)).rejects.toThrow('NEXT_REDIRECT');

    expect(m.tx.projectEarthing.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ targetResistanceOhm: 10 }) as unknown }),
    );
  });

  it.each([
    [
      'a three-phase site',
      { phases: 3 },
      'Le site doit être monophasé (abonné BT monophasé) pour les propositions automatiques.',
    ],
    [
      'a site with a lightning rod',
      { lightningRod: true },
      'Un paratonnerre est déclaré sur le site : des parafoudres de type 1 sont requis, les propositions automatiques ne le gèrent pas encore.',
    ],
  ])('refuses %s without sizing or writing', async (_name, siteOverride, reason) => {
    const key = await firstProposalKey();
    m.mockGetSpecificYield.mockClear();
    m.mockProjectFindFirst.mockImplementation((args: { select?: unknown }) => {
      const project = billProject();
      return Promise.resolve(
        args.select
          ? { id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' }
          : { ...project, site: { ...project.site!, ...siteOverride } },
      );
    });

    const result = await applyProposalAction('p1', key);

    expect(result).toEqual({ error: reason });
    expect(m.mockGetSpecificYield).not.toHaveBeenCalled();
    expect(m.mockTransaction).not.toHaveBeenCalled();
  });

  it("returns Projet introuvable for another company's project", async () => {
    m.mockValidateSession.mockResolvedValue({ ...user, companyId: 'company-2' });

    const result = await applyProposalAction('p1', 'any-key');

    expect(result).toEqual({ error: 'Projet introuvable.' });
    expect(m.mockLoadSizingCatalog).not.toHaveBeenCalled();
    expect(m.mockTransaction).not.toHaveBeenCalled();
  });
});
