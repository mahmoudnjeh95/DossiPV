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
    structureUpsert: vi.fn(),
    earthingUpsert: vi.fn(),
    cableFindFirst: vi.fn(),
    moduleFindFirst: vi.fn(),
    inverterFindMany: vi.fn(),
    transaction: vi.fn(),
    cableFindMany: vi.fn(),
    accessoryFindFirst: vi.fn(),
    arrayConfigFindUnique: vi.fn(),
    protectionsFindUnique: vi.fn(),
    protectionsUpsert: vi.fn(),
    cablingConfigFindUnique: vi.fn(),
    cableRunFindMany: vi.fn(),
    earthingFindUnique: vi.fn(),
    spdFindFirst: vi.fn(),
    dcSwitchFindFirst: vi.fn(),
    acBreakerFindFirst: vi.fn(),
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
      ...actual.db, company: { findUnique: () => Promise.resolve({ kind: 'INSTALLER' }) },
      project: { findFirst: mocks.projectFindFirst },
      dossierJob: { count: mocks.jobCount },
      projectClient: { findUnique: mocks.clientFindUnique, upsert: mocks.clientUpsert },
      projectSite: { upsert: mocks.siteUpsert },
      projectStructure: { upsert: mocks.structureUpsert },
      pvModule: { findFirst: mocks.moduleFindFirst },
      inverter: { findMany: mocks.inverterFindMany },
      cable: { findMany: mocks.cableFindMany, findFirst: mocks.cableFindFirst },
      projectEarthing: { upsert: mocks.earthingUpsert, findUnique: mocks.earthingFindUnique },
      projectArrayConfig: { findUnique: mocks.arrayConfigFindUnique },
      projectProtections: { findUnique: mocks.protectionsFindUnique, upsert: mocks.protectionsUpsert },
      projectCablingConfig: { findUnique: mocks.cablingConfigFindUnique },
      projectCableRun: { findMany: mocks.cableRunFindMany },
      spd: { findFirst: mocks.spdFindFirst },
      dcSwitch: { findFirst: mocks.dcSwitchFindFirst },
      acBreaker: { findFirst: mocks.acBreakerFindFirst },
      accessory: { findFirst: mocks.accessoryFindFirst },
      $transaction: mocks.transaction,
    },
  };
});

import { equipmentChoiceScope } from '../lib/project-access';
import {
  saveClientAction,
  saveSiteAction,
  saveArrayAction,
  saveCablingAction,
  saveStructureAction,
  saveEarthingAction,
  saveProtectionsAction,
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
  mocks.arrayConfigFindUnique.mockResolvedValue(null);
  mocks.protectionsFindUnique.mockResolvedValue(null);
  mocks.cablingConfigFindUnique.mockResolvedValue(null);
  mocks.cableRunFindMany.mockResolvedValue([]);
  mocks.earthingFindUnique.mockResolvedValue(null);
});

describe('saveStructureAction', () => {
  it('saves a structure with only material and wind speed, clearing every optional field', async () => {
    const result = await saveStructureAction(
      'project-1',
      undefined,
      form({ material: 'ALUMINIUM', windSpeedKmh: '120' }),
    );

    expect(mocks.mockRedirect).toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(mocks.structureUpsert).toHaveBeenCalledTimes(1);
    const { create } = mocks.structureUpsert.mock.calls[0]?.[0] as { create: unknown };
    expect(create).toMatchObject({
      projectId: 'project-1',
      material: 'ALUMINIUM',
      windSpeedKmh: 120,
      frameCount: null,
      structureWeightN: null,
      heightHM: null,
      depthDM: null,
      liftCoeffNPerM2: null,
      dragCoeffNPerM2: null,
    });
  });

  it('still rejects a missing wind speed', async () => {
    const result = await saveStructureAction('project-1', undefined, form({ material: 'ALUMINIUM' }));
    expect(result).toMatchObject({ error: expect.stringContaining('Vitesse de vent') as string });
    expect(mocks.structureUpsert).not.toHaveBeenCalled();
  });
});

describe('saveEarthingAction', () => {
  it('saves from only cable, rod count and target resistance, defaulting the rest', async () => {
    mocks.cableFindFirst.mockResolvedValue({ id: 'cable-1' });
    await saveEarthingAction(
      'project-1',
      undefined,
      form({ earthCableId: 'cable-1', rodCount: '2', targetResistanceOhm: '30' }),
    );

    expect(mocks.earthingUpsert).toHaveBeenCalledTimes(1);
    expect((mocks.earthingUpsert.mock.calls[0]?.[0] as { create: unknown }).create).toMatchObject({
      earthCableId: 'cable-1',
      distributionBlockId: null,
      mainEarthSectionMm2: 16,
      frameEarthSectionMm2: 16,
      earthToPitSectionMm2: 25,
      rodCount: 2,
      rodLengthM: 1.5,
      rodSpacingCm: null,
      pitSizeCm: null,
      targetResistanceOhm: 30,
    });
  });
});

describe('saveEarthingAction on the building earth', () => {
  it('needs no rod count and keeps rodCount at 0, so the two never diverge', async () => {
    mocks.cableFindFirst.mockResolvedValue({ id: 'cable-1' });
    mocks.earthingFindUnique.mockResolvedValue({ earthCableId: 'cable-1', distributionBlockId: null, useBuildingEarth: true });

    const result = await saveEarthingAction('project-1', undefined, form({ earthCableId: 'cable-1', targetResistanceOhm: '30' }));

    expect(result).toBeUndefined();
    const call = mocks.earthingUpsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    expect(call.update).toMatchObject({ rodCount: 0 });
    expect(call.update).not.toHaveProperty('useBuildingEarth');
  });

  it('still requires a rod count for a dedicated rod', async () => {
    mocks.earthingFindUnique.mockResolvedValue({ earthCableId: 'cable-1', distributionBlockId: null, useBuildingEarth: false });
    const result = await saveEarthingAction('project-1', undefined, form({ earthCableId: 'cable-1', targetResistanceOhm: '30' }));
    expect(result).toHaveProperty('error');
    expect(mocks.earthingUpsert).not.toHaveBeenCalled();
  });
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
        maxAcVoltageDropPct: 1,
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
        phases: '2',
        tiltDeg: '30',
      }),
    );

    expect(result?.error).toContain('Latitude : doit être ≤ 90.');
    expect(result?.error).toContain('Phases : choisir monophasé ou triphasé.');
    expect(mocks.siteUpsert).not.toHaveBeenCalled();
  });

  it('stores the lightning-rod checkbox as a boolean and leaves the map pins and unused columns alone', async () => {
    mocks.siteUpsert.mockResolvedValue({});

    await saveSiteAction(
      'project-1',
      undefined,
      form({
        gpsLat: '36.5',
        gpsLon: '10.5',
        phases: '3',
        tiltDeg: '25',
        lightningRod: 'on',
      }),
    );

    const call = mocks.siteUpsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(call.update).toMatchObject({ phases: 3, lightningRod: true, tiltDeg: 25 });
    expect(call.update).not.toHaveProperty('meterPointLat');
    expect(call.update).not.toHaveProperty('gridType');
    expect(call.update).not.toHaveProperty('generator');
    expect(call.create).toMatchObject({ gridType: 'BT', mountingType: 'FLAT_ROOF_BALLAST' });
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

  it('refuses a module outside the installer library', async () => {
    mocks.moduleFindFirst.mockResolvedValue(null);

    expect(await saveArrayAction('project-1', payload)).toEqual({
      error: 'Module introuvable dans votre bibliothèque.',
    });
    expect(mocks.moduleFindFirst).toHaveBeenCalledWith({
      where: { id: 'module-1', ...equipmentChoiceScope('company-1', []) },
      select: { id: true },
    });
  });

  it('rejects an inverter outside the library', async () => {
    mocks.moduleFindFirst.mockResolvedValue({ id: 'module-1' });
    mocks.inverterFindMany.mockResolvedValue([]);

    expect(await saveArrayAction('project-1', payload)).toEqual({
      error: 'Onduleur introuvable dans votre bibliothèque.',
    });
    expect(mocks.inverterFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['inverter-1'] }, ...equipmentChoiceScope('company-1', []) },
      select: { id: true, mpptCount: true },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('accepts the inverter already saved in the project even if removed from the library', async () => {
    mocks.arrayConfigFindUnique.mockResolvedValue({ moduleId: 'module-1', inverters: [{ inverterId: 'inverter-1' }] });
    mocks.moduleFindFirst.mockResolvedValue({ id: 'module-1' });
    mocks.inverterFindMany.mockResolvedValue([{ id: 'inverter-1', mpptCount: 2 }]);
    mocks.transaction.mockResolvedValue(undefined);

    expect(await saveArrayAction('project-1', payload)).toBeUndefined();
    expect(mocks.inverterFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['inverter-1'] }, ...equipmentChoiceScope('company-1', ['inverter-1']) },
      select: { id: true, mpptCount: true },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
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

  it('accepts a single-phase site connection and no longer offers three-phase', async () => {
    mocks.moduleFindFirst.mockResolvedValue({ id: 'module-1' });
    mocks.inverterFindMany.mockResolvedValue([{ id: 'inverter-1', mpptCount: 2 }]);
    mocks.transaction.mockResolvedValue(undefined);
    const withPhase = (phaseConnection: string): ArrayPayload => ({
      ...payload,
      inverters: [{ ...payload.inverters[0]!, phaseConnection }],
    });

    expect(await saveArrayAction('project-1', withPhase('MONO'))).toBeUndefined();
    expect(await saveArrayAction('project-1', withPhase('3PH'))).toEqual({
      error: 'Raccordement de phase invalide.',
    });
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
    maxAcVoltageDropPct: 1,
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

  it('saves both the DC and the AC voltage-drop limits', async () => {
    mocks.cableFindMany.mockResolvedValue([
      { id: 'c1', brand: 'G', model: 'DC', usage: 'DC_SOLAR', sections: [{ sectionMm2: 6 }] },
      { id: 'c2', brand: 'G', model: 'AC', usage: 'AC', sections: [{ sectionMm2: 6 }] },
    ]);
    const upsert = vi.fn();
    const tx = {
      projectCablingConfig: { upsert },
      projectCableRun: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
    await saveCablingAction('project-1', {
      ...base,
      maxVoltageDropPct: 2.5,
      maxAcVoltageDropPct: 0.8,
      runs: [run('DC', 'c1'), run('AC', 'c2')],
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ maxVoltageDropPct: 2.5, maxAcVoltageDropPct: 0.8 }) as unknown,
      }),
    );
  });

  it.each([0, 11])('rejects an AC voltage-drop limit of %s', async (value) => {
    expect(
      await saveCablingAction('project-1', { ...base, maxAcVoltageDropPct: value, runs: [run('DC', 'c1'), run('AC', 'c2')] }),
    ).toEqual({ error: 'Chute de tension maximale AC invalide (0–10 %).' });
  });
});

describe('saveProtectionsAction', () => {
  const protections = { dcSpdId: 's1', dcSwitchId: 'sw1', acBreakerId: 'b1', acSpdId: 's2' };

  it('refuses a protection outside the library and keeps the project unchanged', async () => {
    mocks.spdFindFirst.mockResolvedValue({ id: 's' });
    mocks.dcSwitchFindFirst.mockResolvedValue(null);
    mocks.acBreakerFindFirst.mockResolvedValue({ id: 'b1' });

    const result = await saveProtectionsAction('project-1', undefined, form(protections));
    expect(result).toEqual({ error: 'Un équipement sélectionné est introuvable dans votre bibliothèque.' });
    expect(mocks.dcSwitchFindFirst).toHaveBeenCalledWith({
      where: { id: 'sw1', ...equipmentChoiceScope('company-1', []) },
      select: { id: true },
    });
    expect(mocks.protectionsUpsert).not.toHaveBeenCalled();
  });

  it('keeps accepting a protection already saved in the project', async () => {
    mocks.protectionsFindUnique.mockResolvedValue({ dcSwitchId: 'sw1' });
    mocks.spdFindFirst.mockResolvedValue({ id: 's' });
    mocks.dcSwitchFindFirst.mockResolvedValue({ id: 'sw1' });
    mocks.acBreakerFindFirst.mockResolvedValue({ id: 'b1' });

    await saveProtectionsAction('project-1', undefined, form(protections));
    expect(mocks.dcSwitchFindFirst).toHaveBeenCalledWith({
      where: { id: 'sw1', ...equipmentChoiceScope('company-1', ['sw1']) },
      select: { id: true },
    });
    expect(mocks.protectionsUpsert).toHaveBeenCalledTimes(1);
  });
});
