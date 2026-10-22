import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeRunLengthsM, type EngineResult } from '@dossipv/engine';
import { buildFullProject } from './fixtures/full-project';

const m = vi.hoisted(() => ({
  mockRequireOwnedProject: vi.fn(),
  mockSiteUpdate: vi.fn(),
  mockEarthingUpdateMany: vi.fn(),
  mockRunUpdateMany: vi.fn(),
  mockProjectFindFirst: vi.fn(),
  mockProjectUpdate: vi.fn(),
  mockBuildEngineInput: vi.fn(),
  mockRunEngine: vi.fn(),
  mockGenerate: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      projectSite: { update: m.mockSiteUpdate },
      projectEarthing: { updateMany: m.mockEarthingUpdateMany },
      projectCableRun: { updateMany: m.mockRunUpdateMany },
      project: { findFirst: m.mockProjectFindFirst, update: m.mockProjectUpdate },
    },
  };
});
vi.mock('../lib/project-access', async () => {
  const actual = await vi.importActual<typeof import('../lib/project-access')>('../lib/project-access');
  return { ...actual, requireOwnedProject: m.mockRequireOwnedProject };
});
vi.mock('../lib/project-engine-input', async () => {
  const actual = await vi.importActual<typeof import('../lib/project-engine-input')>('../lib/project-engine-input');
  return { ...actual, buildEngineInput: m.mockBuildEngineInput };
});
vi.mock('@dossipv/engine', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/engine')>('@dossipv/engine');
  return { ...actual, runEngine: m.mockRunEngine };
});
vi.mock('../app/(app)/projects/[id]/actions', () => ({ generateDossierAction: m.mockGenerate }));

import { saveLocationsAction } from '../app/(app)/projects/[id]/locations/actions';

const field = { lat: 34.4, lon: 10.1 };
const technicalRoom = { lat: 34.4, lon: 10.10005 };
const meter = { lat: 34.4, lon: 10.1001 };
const payload = { field, technicalRoom, meter, earthPit: null, floors: 1, buildingType: 'APARTMENT_BUILDING' as const };

function engineResult(overrides: { c13?: boolean; acDropPct?: number; dcDropPct?: number } = {}): EngineResult {
  return {
    derived: { DU_DC_PCT: overrides.dcDropPct ?? 1, DU_AC_PCT: overrides.acDropPct ?? 1 },
    checks: [
      { id: 'C16', level: 'BLOCK', pass: true, message: '' },
      { id: 'C13', level: 'BLOCK', pass: overrides.c13 ?? true, message: '' },
    ],
    hasBlockingFailure: false,
  };
}

function projectWithAcSections(): ReturnType<typeof buildFullProject> {
  const project = buildFullProject();
  return {
    ...project,
    cableRuns: project.cableRuns.map((run) =>
      run.circuitType === 'AC'
        ? {
            ...run,
            sectionMm2: 2.5,
            cable: {
              ...run.cable,
              sections: [4, 2.5, 6].map((sectionMm2) => ({
                id: `s${sectionMm2}`,
                cableId: run.cableId,
                sectionMm2,
                izA: 30,
                izReferenceMethod: 'B',
              })),
            },
          }
        : run,
    ),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.mockRequireOwnedProject.mockResolvedValue({ id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' });
  m.mockProjectFindFirst.mockResolvedValue(projectWithAcSections());
  m.mockBuildEngineInput.mockReturnValue({ ok: true, input: { maxVoltageDropPct: 3, maxAcVoltageDropPct: 1 }, meta: {} });
  m.mockRunEngine.mockReturnValue(engineResult());
  m.mockGenerate.mockResolvedValue(undefined);
});

describe('saveLocationsAction', () => {
  it('guards first', async () => {
    m.mockRequireOwnedProject.mockRejectedValue(new Error('NEXT_REDIRECT:/login'));

    await expect(saveLocationsAction('p1', payload)).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['a string', 'field=1'],
    ['an object without the meter key', { field: payload.field, technicalRoom: payload.technicalRoom, earthPit: null, floors: 1, buildingType: 'HOUSE' }],
    ['an unknown building type', { ...payload, buildingType: 'VILLA' }],
    ['a missing building type key', { field, technicalRoom, meter, earthPit: null, floors: 1 }],
    ['a point with a string latitude', { ...payload, field: { lat: '34.4', lon: 10.1 } }],
    ['a point that is not an object', { ...payload, earthPit: 'here' }],
    ['a non-numeric floor count', { ...payload, floors: '1' }],
  ])('refuses %s as the payload before touching the database', async (_label, invalidPayload) => {
    const result = await saveLocationsAction('p1', invalidPayload as never);

    expect(result).toEqual({ error: 'Données des emplacements invalides.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('asks for the building type', async () => {
    const result = await saveLocationsAction('p1', { ...payload, buildingType: null });

    expect(result).toEqual({ error: 'Indiquez si le client habite une maison ou un immeuble.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('asks for the roof level', async () => {
    const result = await saveLocationsAction('p1', { ...payload, floors: null });

    expect(result).toEqual({ error: "Indiquez l'étage du toit où seront posés les panneaux." });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('requires the earth pit for a house', async () => {
    const result = await saveLocationsAction('p1', { ...payload, buildingType: 'HOUSE' });

    expect(result).toEqual({ error: 'Placez le point « Piquet de terre » : il est obligatoire pour une maison.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('refuses floor 5 for a house but accepts it for a building', async () => {
    const pit = { lat: 34.4, lon: 10.1002 };
    const house = await saveLocationsAction('p1', { ...payload, buildingType: 'HOUSE', earthPit: pit, floors: 5 });
    expect(house).toEqual({ error: 'Niveau du toit invalide.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();

    await expect(saveLocationsAction('p1', { ...payload, floors: 5 })).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');
    expect(m.mockSiteUpdate).toHaveBeenCalled();

    expect(await saveLocationsAction('p1', { ...payload, floors: 16 })).toEqual({ error: 'Niveau du toit invalide.' });
    expect(await saveLocationsAction('p1', { ...payload, floors: 1.5 })).toEqual({ error: 'Niveau du toit invalide.' });
  });

  it('uses the building earth for a flat without a pit', async () => {
    await expect(saveLocationsAction('p1', payload)).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');

    expect(m.mockEarthingUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      data: { useBuildingEarth: true, rodCount: 0 },
    });
    expect((m.mockSiteUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data).toMatchObject({
      buildingType: 'APARTMENT_BUILDING',
    });
  });

  it('keeps a dedicated rod when a flat places a pit, and for a house', async () => {
    const pit = { lat: 34.4, lon: 10.1002 };
    await expect(saveLocationsAction('p1', { ...payload, earthPit: pit })).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');
    expect(m.mockEarthingUpdateMany).toHaveBeenLastCalledWith({
      where: { projectId: 'p1' },
      data: { useBuildingEarth: false, rodCount: 1 },
    });
    await expect(saveLocationsAction('p1', { ...payload, buildingType: 'HOUSE', earthPit: pit, floors: 0 })).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');
    expect(m.mockEarthingUpdateMany).toHaveBeenLastCalledWith({
      where: { projectId: 'p1' },
      data: { useBuildingEarth: false, rodCount: 1 },
    });
  });

  it('asks for the meter point', async () => {
    const result = await saveLocationsAction('p1', { ...payload, meter: null });

    expect(result).toEqual({ error: 'Placez le point « Compteur STEG » sur la carte.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('refuses points 2 km apart', async () => {
    const result = await saveLocationsAction('p1', { ...payload, meter: { lat: 34.418, lon: 10.1 } });

    expect(result).toEqual({ error: 'Les points sont trop éloignés (plus de 500 m) : vérifiez leur emplacement.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('saves points and lengths, then opens the summary without generating', async () => {
    const lengths = computeRunLengthsM({ field, technicalRoom, meter }, 1);

    await expect(saveLocationsAction('p1', { ...payload, earthPit: { lat: 34.4, lon: 10.1002 } })).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');

    const siteUpdate = m.mockSiteUpdate.mock.calls[0]?.[0] as { where: unknown; data: Record<string, unknown> };
    expect(siteUpdate.where).toEqual({ projectId: 'p1' });
    expect(siteUpdate.data).toMatchObject({
      gpsLat: 34.4,
      gpsLon: 10.1,
      installationPointLat: 34.4,
      technicalRoomPointLon: 10.10005,
      meterPointLon: 10.1001,
      earthPitPointLon: 10.1002,
      floors: 1,
    });
    expect(m.mockRunUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', circuitType: 'DC' },
      data: { lengthM: lengths.dcLengthM },
    });
    expect(m.mockRunUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', circuitType: 'AC' },
      data: { lengthM: lengths.acLengthM },
    });
    expect(m.mockProjectUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { flowStep: 'READY' } });
    expect(m.mockRedirect).toHaveBeenCalledWith('/projects/p1/summary');
    expect(m.mockProjectUpdate.mock.invocationCallOrder[0]).toBeLessThan(m.mockRedirect.mock.invocationCallOrder[0]!);
    expect(m.mockGenerate).not.toHaveBeenCalled();
  });

  it('bumps the AC section when the voltage drop fails', async () => {
    m.mockRunEngine
      .mockReturnValueOnce(engineResult()) // DC fits
      .mockReturnValueOnce(engineResult({ acDropPct: 4 })) // AC 2.5 mm² too small
      .mockReturnValue(engineResult()); // AC 4 mm² fits

    await expect(saveLocationsAction('p1', payload)).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');

    expect(m.mockRunUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', circuitType: 'AC' },
      data: { sectionMm2: 4 },
    });
    const dcSectionWrites = m.mockRunUpdateMany.mock.calls.filter((call) => {
      const arg = call[0] as { where: { circuitType: string }; data: Record<string, unknown> };
      return arg.where.circuitType === 'DC' && 'sectionMm2' in arg.data;
    });
    expect(dcSectionWrites).toHaveLength(0);
    expect(m.mockGenerate).not.toHaveBeenCalled();
  });

  it('bumps the AC run to a larger section for the 1 % limit but keeps the DC run at 3 %', async () => {
    // DC drops 2.5 % (fine against 3 %); AC drops 2 % (fine against 3 %, too much against 1 %).
    m.mockRunEngine
      .mockReturnValueOnce(engineResult({ dcDropPct: 2.5 })) // DC fits its 3 % limit
      .mockReturnValueOnce(engineResult({ dcDropPct: 2.5, acDropPct: 2 })) // AC 2.5 mm² over 1 %
      .mockReturnValue(engineResult({ dcDropPct: 2.5, acDropPct: 0.9 })); // AC 4 mm² within 1 %

    await expect(saveLocationsAction('p1', payload)).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');

    expect(m.mockRunUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', circuitType: 'AC' },
      data: { sectionMm2: 4 },
    });
    const dcSectionWrites = m.mockRunUpdateMany.mock.calls.filter((call) => {
      const arg = call[0] as { where: { circuitType: string }; data: Record<string, unknown> };
      return arg.where.circuitType === 'DC' && 'sectionMm2' in arg.data;
    });
    expect(dcSectionWrites).toHaveLength(0);
    expect(m.mockGenerate).not.toHaveBeenCalled();
  });

  it('reports the AC circuit when no section fits', async () => {
    m.mockRunEngine.mockReturnValue(engineResult({ acDropPct: 2 })); // AC never gets under 1 %

    const result = await saveLocationsAction('p1', payload);

    expect(result?.error).toMatch(/liaison AC \(\d+ m\)\.$/);
    expect(m.mockRedirect).not.toHaveBeenCalled();
    expect(m.mockProjectUpdate).not.toHaveBeenCalled();
  });

  it('stops when no larger section is left, keeping the points', async () => {
    m.mockRunEngine.mockReturnValue(engineResult({ c13: false }));
    m.mockRunEngine.mockReturnValueOnce(engineResult());

    const result = await saveLocationsAction('p1', payload);

    expect(result?.error).toMatch(/^Aucune section de câble ne respecte la chute de tension pour la liaison AC \(\d+ m\)\.$/);
    expect(m.mockSiteUpdate).toHaveBeenCalled();
    expect(m.mockGenerate).not.toHaveBeenCalled();
  });

  it('hides the raw engine error behind a fixed message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.mockRunEngine.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await saveLocationsAction('p1', payload);

    expect(result).toEqual({ error: 'Erreur de calcul : vérifiez les sections du projet.' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
