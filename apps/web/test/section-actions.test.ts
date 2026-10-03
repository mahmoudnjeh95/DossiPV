import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    projectFindFirst: vi.fn(),
    jobCount: vi.fn(),
    clientFindUnique: vi.fn(),
    clientUpsert: vi.fn(),
    siteUpsert: vi.fn(),
    moduleFindFirst: vi.fn(),
    inverterFindMany: vi.fn(),
    transaction: vi.fn(),
    cableFindMany: vi.fn(),
    accessoryFindFirst: vi.fn(),
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
      project: { findFirst: mocks.projectFindFirst },
      dossierJob: { count: mocks.jobCount },
      projectClient: { findUnique: mocks.clientFindUnique, upsert: mocks.clientUpsert },
      projectSite: { upsert: mocks.siteUpsert },
      pvModule: { findFirst: mocks.moduleFindFirst },
      inverter: { findMany: mocks.inverterFindMany },
      cable: { findMany: mocks.cableFindMany },
      accessory: { findFirst: mocks.accessoryFindFirst },
      $transaction: mocks.transaction,
    },
  };
});

import {
  saveClientAction,
  saveSiteAction,
  saveArrayAction,
  saveCablingAction,
  type ArrayPayload,
  type CablingPayload,
} from '../app/(app)/projects/[id]/sections/actions';

const user = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'a@b.com',
  fullName: 'A',
  role: 'OWNER' as const,
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    data.set(k, v);
  }
  return data;
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
    }
  }
  mocks.mockGet.mockReturnValue({ value: 'valid-token' });
  mocks.mockCookies.mockImplementation(() => Promise.resolve({ get: mocks.mockGet }));
  mocks.mockValidateSession.mockResolvedValue(user);
  mocks.projectFindFirst.mockResolvedValue({ id: 'project-1' });
  mocks.jobCount.mockResolvedValue(0);
});

describe('tenant isolation', () => {
  it('every section action refuses a project outside the caller company', async () => {
    mocks.projectFindFirst.mockResolvedValue(null);

    expect(
      await saveClientAction(
        'other',
        undefined,
        form({ fullName: 'X', clientKind: 'residential' }),
      ),
    ).toEqual({ error: 'Projet introuvable.' });
    expect(await saveSiteAction('other', undefined, form({}))).toEqual({
      error: 'Projet introuvable.',
    });
    expect(
      await saveArrayAction('other', {
        moduleId: 'm',
        tMinC: -10,
        tMaxC: 85,
        rowsDescription: null,
        inverters: [],
      }),
    ).toEqual({ error: 'Projet introuvable.' });
    expect(
      await saveCablingAction('other', {
        cosPhi: 0.8,
        lambdaOhmPerM: 0,
        maxVoltageDropPct: 3,
        connectorId: null,
        cableTrayId: null,
        runs: [],
      }),
    ).toEqual({ error: 'Projet introuvable.' });

    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: 'other', companyId: 'company-1' },
      select: { id: true },
    });
    expect(mocks.clientUpsert).not.toHaveBeenCalled();
    expect(mocks.siteUpsert).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('saveClientAction', () => {
  it('upserts the client and redirects back to the project with a saved flag', async () => {
    mocks.clientFindUnique.mockResolvedValue(null);
    mocks.clientUpsert.mockResolvedValue({});

    await saveClientAction(
      'project-1',
      undefined,
      form({
        fullName: 'Habib Khedhira',
        clientKind: 'residential',
        stegReference: '434-303',
        address: 'Nabeul',
        annualConsumptionKWh: '4500',
      }),
    );

    expect(mocks.clientUpsert).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      create: expect.objectContaining({
        projectId: 'project-1',
        fullName: 'Habib Khedhira',
        stegReference: '434-303',
        address: 'Nabeul',
        annualConsumptionKWh: 4500,
        cin: null,
      }) as unknown,
      update: expect.objectContaining({ fullName: 'Habib Khedhira' }) as unknown,
    });
    expect(mocks.mockRedirect).toHaveBeenCalledWith('/projects/project-1?saved=client');
  });

  it('keeps the stored name and STEG reference once a dossier has been generated', async () => {
    mocks.jobCount.mockResolvedValue(1);
    mocks.clientFindUnique.mockResolvedValue({ fullName: 'Original', stegReference: 'REF-1' });
    mocks.clientUpsert.mockResolvedValue({});

    await saveClientAction(
      'project-1',
      undefined,
      form({ fullName: 'Someone Else', clientKind: 'residential', stegReference: 'REF-2' }),
    );

    expect(mocks.jobCount).toHaveBeenCalledWith({
      where: { projectId: 'project-1', status: { not: 'FAILED' } },
    });
    expect(mocks.clientUpsert.mock.calls[0]?.[0]).toMatchObject({
      update: { fullName: 'Original', stegReference: 'REF-1' },
    });
  });
});

describe('saveSiteAction', () => {
  it('rejects a phase count other than 1 or 3 and out-of-range coordinates', async () => {
    const result = await saveSiteAction(
      'project-1',
      undefined,
      form({
        gpsLat: '95',
        gpsLon: '10',
        gridType: 'BT',
        phases: '2',
        mountingType: 'GROUND',
        tiltDeg: '30',
      }),
    );

    expect(result?.error).toContain('Latitude : doit être ≤ 90.');
    expect(result?.error).toContain('Phases : choisir monophasé ou triphasé.');
    expect(mocks.siteUpsert).not.toHaveBeenCalled();
  });

  it('stores checkboxes as booleans and leaves the map pins alone', async () => {
    mocks.siteUpsert.mockResolvedValue({});

    await saveSiteAction(
      'project-1',
      undefined,
      form({
        gpsLat: '36.5',
        gpsLon: '10.5',
        gridType: 'BT',
        phases: '3',
        mountingType: 'GROUND',
        tiltDeg: '25',
        lightningRod: 'on',
      }),
    );

    const call = mocks.siteUpsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    expect(call.update).toMatchObject({
      phases: 3,
      lightningRod: true,
      generator: false,
      tiltDeg: 25,
    });
    expect(call.update).not.toHaveProperty('meterPointLat');
  });
});

describe('saveArrayAction', () => {
  const payload: ArrayPayload = {
    moduleId: 'module-1',
    tMinC: -10,
    tMaxC: 85,
    rowsDescription: '',
    inverters: [
      {
        inverterId: 'inverter-1',
        phaseConnection: null,
        mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
      },
    ],
  };

  it('refuses equipment outside the shared + private catalog scope', async () => {
    mocks.moduleFindFirst.mockResolvedValue(null);

    expect(await saveArrayAction('project-1', payload)).toEqual({
      error: 'Module introuvable dans votre bibliothèque.',
    });
    expect(mocks.moduleFindFirst).toHaveBeenCalledWith({
      where: { id: 'module-1', OR: [{ ownerCompanyId: null }, { ownerCompanyId: 'company-1' }] },
      select: { id: true },
    });
  });

  it('refuses more MPPT rows than the inverter has', async () => {
    mocks.moduleFindFirst.mockResolvedValue({ id: 'module-1' });
    mocks.inverterFindMany.mockResolvedValue([{ id: 'inverter-1', mpptCount: 1 }]);

    const twoMppts: ArrayPayload = {
      ...payload,
      inverters: [
        {
          ...payload.inverters[0]!,
          mppts: [
            { stringsInParallel: 1, modulesPerString: 5 },
            { stringsInParallel: 1, modulesPerString: 5 },
          ],
        },
      ],
    };
    expect(await saveArrayAction('project-1', twoMppts)).toEqual({
      error: "L'onduleur sélectionné n'a que 1 MPPT.",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects non-integer or out-of-range string counts before any lookup', async () => {
    const bad: ArrayPayload = {
      ...payload,
      inverters: [
        { ...payload.inverters[0]!, mppts: [{ stringsInParallel: 1.5, modulesPerString: 5 }] },
      ],
    };
    expect(await saveArrayAction('project-1', bad)).toEqual({
      error: 'Nombre de chaînes ou de modules par chaîne invalide.',
    });
    expect(mocks.moduleFindFirst).not.toHaveBeenCalled();
  });

  it('replaces the array configuration in one transaction when everything is valid', async () => {
    mocks.moduleFindFirst.mockResolvedValue({ id: 'module-1' });
    mocks.inverterFindMany.mockResolvedValue([{ id: 'inverter-1', mpptCount: 2 }]);
    mocks.transaction.mockResolvedValue(undefined);

    expect(await saveArrayAction('project-1', payload)).toBeUndefined();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('saveCablingAction', () => {
  const run = (circuitType: 'DC' | 'AC', cableId: string): CablingPayload['runs'][number] => ({
    circuitType,
    label: 'L',
    cableId,
    sectionMm2: 6,
    lengthM: 10,
    installMethod: '13',
    ambientContext: 'TRAY_SUN',
    groupedCircuits: 1,
    layers: 1,
  });
  const base: CablingPayload = {
    cosPhi: 0.8,
    lambdaOhmPerM: 0.00008,
    maxVoltageDropPct: 3,
    connectorId: null,
    cableTrayId: null,
    runs: [],
  };

  it('requires both a DC and an AC run', async () => {
    expect(await saveCablingAction('project-1', { ...base, runs: [run('DC', 'c1')] })).toEqual({
      error: 'Au moins une liaison DC et une liaison AC sont requises.',
    });
  });

  it('refuses a cable whose usage does not match the circuit', async () => {
    mocks.cableFindMany.mockResolvedValue([
      { id: 'c1', brand: 'G', model: 'DC', usage: 'DC_SOLAR', sections: [{ sectionMm2: 6 }] },
      { id: 'c2', brand: 'G', model: 'AC', usage: 'AC', sections: [{ sectionMm2: 6 }] },
    ]);
    expect(
      await saveCablingAction('project-1', { ...base, runs: [run('DC', 'c2'), run('AC', 'c1')] }),
    ).toEqual({ error: "Le câble G AC n'est pas un câble DC." });
  });

  it('refuses a section missing from the cable catalog entry', async () => {
    mocks.cableFindMany.mockResolvedValue([
      { id: 'c1', brand: 'G', model: 'DC', usage: 'DC_SOLAR', sections: [{ sectionMm2: 4 }] },
      { id: 'c2', brand: 'G', model: 'AC', usage: 'AC', sections: [{ sectionMm2: 6 }] },
    ]);
    expect(
      await saveCablingAction('project-1', { ...base, runs: [run('DC', 'c1'), run('AC', 'c2')] }),
    ).toEqual({ error: "La section 6 mm² n'existe pas pour le câble G DC." });
  });

  it('writes config and runs in one transaction when valid', async () => {
    mocks.cableFindMany.mockResolvedValue([
      { id: 'c1', brand: 'G', model: 'DC', usage: 'DC_SOLAR', sections: [{ sectionMm2: 6 }] },
      { id: 'c2', brand: 'G', model: 'AC', usage: 'AC', sections: [{ sectionMm2: 6 }] },
    ]);
    mocks.transaction.mockResolvedValue(undefined);
    expect(
      await saveCablingAction('project-1', { ...base, runs: [run('DC', 'c1'), run('AC', 'c2')] }),
    ).toBeUndefined();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
