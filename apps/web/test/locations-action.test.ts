import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeRunLengthsM, type EngineResult } from '@dossipv/engine';
import { buildFullProject } from './fixtures/full-project';

const m = vi.hoisted(() => ({
  mockRequireOwnedProject: vi.fn(),
  mockSiteUpdate: vi.fn(),
  mockRunUpdateMany: vi.fn(),
  mockProjectFindFirst: vi.fn(),
  mockProjectUpdate: vi.fn(),
  mockBuildEngineInput: vi.fn(),
  mockRunEngine: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      projectSite: { update: m.mockSiteUpdate },
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

import { saveLocationsAndGenerateAction } from '../app/(app)/projects/[id]/locations/actions';

const field = { lat: 34.4, lon: 10.1 };
const technicalRoom = { lat: 34.4, lon: 10.10005 };
const meter = { lat: 34.4, lon: 10.1001 };
const payload = { field, technicalRoom, meter, earthPit: null, floors: 1 };

function engineResult(overrides: { c13?: boolean; acDropPct?: number } = {}): EngineResult {
  return {
    derived: { DU_DC_PCT: 1, DU_AC_PCT: overrides.acDropPct ?? 1 },
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
  m.mockBuildEngineInput.mockReturnValue({ ok: true, input: { maxVoltageDropPct: 3 }, meta: {} });
  m.mockRunEngine.mockReturnValue(engineResult());
  m.mockGenerate.mockResolvedValue(undefined);
});

describe('saveLocationsAndGenerateAction', () => {
  it('guards first', async () => {
    m.mockRequireOwnedProject.mockRejectedValue(new Error('NEXT_REDIRECT:/login'));

    await expect(saveLocationsAndGenerateAction('p1', payload)).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['a string', 'field=1'],
    ['an object without the meter key', { field: payload.field, technicalRoom: payload.technicalRoom, earthPit: null, floors: 1 }],
    ['a point with a string latitude', { ...payload, field: { lat: '34.4', lon: 10.1 } }],
    ['a point that is not an object', { ...payload, earthPit: 'here' }],
    ['a non-numeric floor count', { ...payload, floors: '1' }],
  ])('refuses %s as the payload before touching the database', async (_label, invalidPayload) => {
    const result = await saveLocationsAndGenerateAction('p1', invalidPayload as never);

    expect(result).toEqual({ error: 'Données des emplacements invalides.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('asks for the meter point', async () => {
    const result = await saveLocationsAndGenerateAction('p1', { ...payload, meter: null });

    expect(result).toEqual({ error: 'Placez le point « Compteur STEG » sur la carte.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('refuses points 2 km apart', async () => {
    const result = await saveLocationsAndGenerateAction('p1', { ...payload, meter: { lat: 34.418, lon: 10.1 } });

    expect(result).toEqual({ error: 'Les points sont trop éloignés (plus de 500 m) : vérifiez leur emplacement.' });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('saves points, lengths and generates', async () => {
    const lengths = computeRunLengthsM({ field, technicalRoom, meter }, 1);

    const result = await saveLocationsAndGenerateAction('p1', { ...payload, earthPit: { lat: 34.4, lon: 10.1002 } });

    expect(result).toBeUndefined();
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
    expect(m.mockGenerate).toHaveBeenCalledWith('p1', undefined);
  });

  it('bumps the AC section when the voltage drop fails', async () => {
    m.mockRunEngine
      .mockReturnValueOnce(engineResult()) // DC fits
      .mockReturnValueOnce(engineResult({ acDropPct: 4 })) // AC 2.5 mm² too small
      .mockReturnValue(engineResult()); // AC 4 mm² fits

    await saveLocationsAndGenerateAction('p1', payload);

    expect(m.mockRunUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', circuitType: 'AC' },
      data: { sectionMm2: 4 },
    });
    const dcSectionWrites = m.mockRunUpdateMany.mock.calls.filter((call) => {
      const arg = call[0] as { where: { circuitType: string }; data: Record<string, unknown> };
      return arg.where.circuitType === 'DC' && 'sectionMm2' in arg.data;
    });
    expect(dcSectionWrites).toHaveLength(0);
    expect(m.mockGenerate).toHaveBeenCalled();
  });

  it('stops when no larger section is left, keeping the points', async () => {
    m.mockRunEngine.mockReturnValue(engineResult({ c13: false }));
    m.mockRunEngine.mockReturnValueOnce(engineResult());

    const result = await saveLocationsAndGenerateAction('p1', payload);

    expect(result?.error).toMatch(/^Aucune section de câble ne respecte la chute de tension pour la liaison AC \(\d+ m\)\.$/);
    expect(m.mockSiteUpdate).toHaveBeenCalled();
    expect(m.mockGenerate).not.toHaveBeenCalled();
  });

  it('hides the raw engine error behind a fixed message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.mockRunEngine.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await saveLocationsAndGenerateAction('p1', payload);

    expect(result).toEqual({ error: 'Erreur de calcul : vérifiez les sections du projet.' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
