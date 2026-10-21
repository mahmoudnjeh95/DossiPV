import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SizingCatalog } from '@dossipv/engine';

const m = vi.hoisted(() => ({
  pvModule: vi.fn(),
  inverter: vi.fn(),
  dcSwitch: vi.fn(),
  dcFuse: vi.fn(),
  spd: vi.fn(),
  acBreaker: vi.fn(),
  cable: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      pvModule: { findMany: m.pvModule },
      inverter: { findMany: m.inverter },
      dcSwitch: { findMany: m.dcSwitch },
      dcFuse: { findMany: m.dcFuse },
      spd: { findMany: m.spd },
      acBreaker: { findMany: m.acBreaker },
      cable: { findMany: m.cable },
    },
  };
});

import { loadSizingCatalog, missingLibraryKinds } from '../lib/sizing-catalog';

const HOMOLOGATED = new Date('2027-12-31T00:00:00Z');

const ALL_KINDS = [
  'Modules photovoltaïques',
  'Onduleurs monophasés homologués STEG',
  'Interrupteurs-sectionneurs DC',
  'Parafoudres DC',
  'Parafoudres AC',
  'Disjoncteurs AC',
  'Câbles DC (solaire)',
  'Câbles AC',
  'Câbles de terre',
];

const emptyCatalog: SizingCatalog = {
  modules: [],
  inverters: [],
  dcSwitches: [],
  dcFuses: [],
  spds: [],
  acBreakers: [],
  cables: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.pvModule.mockResolvedValue([
    {
      id: 'mod-1', brand: 'JA Solar', model: 'JAM72S30-550/MR', homologationValidTo: HOMOLOGATED,
      pmaxW: 550, vmpV: 41.96, impA: 13.11, vocV: 49.9, iscA: 14,
      tempCoeffVocPct: -0.275, tempCoeffIscPct: 0.045, tempCoeffPmaxPct: -0.35, tempCoeffVmpPct: null,
      irmA: 25, maxSystemVoltageV: 1500, bifacial: false, bifacialGainPct: null,
      lengthMm: 2278, widthMm: 1134, weightKg: 27.3, noctC: 45,
    },
  ]);
  m.inverter.mockResolvedValue([
    {
      id: 'inv-1', brand: 'Sungrow', model: 'SG3.0RS-S', homologationValidTo: null,
      phases: 1, pacW: 3000, sacVA: 3000, vdcMaxV: 600, mpptMinV: 40, mpptMaxV: 560, startUpV: 50,
      mpptCount: 1, inputsPerMppt: 1, idcMaxPerMpptA: 16, iscMaxPerMpptA: 20, vacNomV: 230, iacMaxA: 13.7,
      stegApproved: true,
    },
  ]);
  m.dcSwitch.mockResolvedValue([{ id: 'sw-1', brand: 'Hager', model: 'SB216PV', ratedVoltageV: 600, ratedCurrentA: 16, poles: 2 }]);
  m.dcFuse.mockResolvedValue([{ id: 'fuse-1', brand: 'Hager', model: 'LF315PV', ratedVoltageV: 1000, ratedCurrentA: 15 }]);
  m.spd.mockResolvedValue([
    { id: 'spd-ac', brand: 'Hager', model: 'SPB215D', side: 'AC', type: 2, poles: 2, ucV: 275, upKV: 1.6, inKA: 5, imaxKA: 15, iscpvKA: null },
  ]);
  m.acBreaker.mockResolvedValue([{ id: 'brk-1', brand: 'Hager', model: 'NCN216A', ratedCurrentA: 16, curve: 'C', breakingCapacityKA: 6 }]);
  m.cable.mockResolvedValue([
    {
      id: 'cable-dc', brand: 'Generic', model: 'H1Z2Z2-K', usage: 'DC_SOLAR', conductor: 'Cu', insulation: 'PR', standard: null,
      sections: [{ id: 's1', cableId: 'cable-dc', sectionMm2: 6, izA: 58, izReferenceMethod: 'C' }],
    },
  ]);
});

describe('loadSizingCatalog', () => {
  it('maps one row of each type', async () => {
    const catalog = await loadSizingCatalog('company-1');

    expect(catalog).toEqual({
      modules: [
        {
          id: 'mod-1', brand: 'JA Solar', model: 'JAM72S30-550/MR', homologationValidTo: '2027-12-31',
          pmaxW: 550, vmpV: 41.96, impA: 13.11, vocV: 49.9, iscA: 14,
          tempCoeffVocPct: -0.275, tempCoeffIscPct: 0.045, tempCoeffPmaxPct: -0.35,
          irmA: 25, maxSystemVoltageV: 1500, bifacial: false,
          lengthMm: 2278, widthMm: 1134, weightKg: 27.3, noctC: 45,
        },
      ],
      inverters: [
        {
          id: 'inv-1', brand: 'Sungrow', model: 'SG3.0RS-S', homologationValidTo: null,
          phases: 1, pacW: 3000, sacVA: 3000, vdcMaxV: 600, mpptMinV: 40, mpptMaxV: 560, startUpV: 50,
          mpptCount: 1, inputsPerMppt: 1, idcMaxPerMpptA: 16, iscMaxPerMpptA: 20, vacNomV: 230, iacMaxA: 13.7,
          stegApproved: true,
        },
      ],
      dcSwitches: [{ id: 'sw-1', brand: 'Hager', model: 'SB216PV', ratedVoltageV: 600, ratedCurrentA: 16 }],
      dcFuses: [{ id: 'fuse-1', brand: 'Hager', model: 'LF315PV', ratedCurrentA: 15, ratedVoltageV: 1000 }],
      spds: [{ id: 'spd-ac', brand: 'Hager', model: 'SPB215D', side: 'AC', type: 2, ucV: 275, upKV: 1.6, inKA: 5, iscpvKA: null }],
      acBreakers: [{ id: 'brk-1', brand: 'Hager', model: 'NCN216A', ratedCurrentA: 16 }],
      cables: [
        {
          id: 'cable-dc', brand: 'Generic', model: 'H1Z2Z2-K', usage: 'DC_SOLAR', conductor: 'Cu', insulation: 'PR',
          sections: [{ sectionMm2: 6, izA: 58, izReferenceMethod: 'C' }],
        },
      ],
    });
  });

  it('queries every table with the library and catalog filter', async () => {
    await loadSizingCatalog('company-1');

    const where = {
      AND: [
        { libraryItems: { some: { companyId: 'company-1' } } },
        { OR: [{ ownerCompanyId: null, catalogStatus: 'PUBLISHED' }, { ownerCompanyId: 'company-1' }] },
      ],
    };
    for (const findMany of [m.pvModule, m.inverter, m.dcSwitch, m.dcFuse, m.spd, m.acBreaker, m.cable]) {
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    }
    expect(m.cable).toHaveBeenCalledWith(expect.objectContaining({ include: { sections: true } }));
  });

  it('skips a cable section whose reference method the engine does not know', async () => {
    m.cable.mockResolvedValue([
      {
        id: 'cable-ac', brand: 'Generic', model: 'U1000 R2V', usage: 'AC', conductor: 'Cu', insulation: 'PR', standard: null,
        sections: [
          { id: 's1', cableId: 'cable-ac', sectionMm2: 4, izA: 45, izReferenceMethod: 'C' },
          { id: 's2', cableId: 'cable-ac', sectionMm2: 6, izA: 58, izReferenceMethod: 'Z' },
        ],
      },
    ]);

    const catalog = await loadSizingCatalog('company-1');

    expect(catalog.cables[0]?.sections).toEqual([{ sectionMm2: 4, izA: 45, izReferenceMethod: 'C' }]);
  });
});

describe('missingLibraryKinds', () => {
  it('lists all nine kinds, in order, for an empty catalog', () => {
    expect(missingLibraryKinds(emptyCatalog)).toEqual(ALL_KINDS);
  });

  it('asks for a single-phase STEG inverter when the library only has three-phase ones', async () => {
    m.inverter.mockResolvedValue([
      {
        id: 'inv-3ph', brand: 'Sungrow', model: 'SG10RT', homologationValidTo: null,
        phases: 3, pacW: 9999, sacVA: 9999, vdcMaxV: 1100, mpptMinV: 160, mpptMaxV: 1000, startUpV: 180,
        mpptCount: 2, inputsPerMppt: 1, idcMaxPerMpptA: 16, iscMaxPerMpptA: 20, vacNomV: 400, iacMaxA: 15.2,
        stegApproved: true,
      },
    ]);
    const catalog = await loadSizingCatalog('company-1');

    const missing = missingLibraryKinds(catalog);

    expect(missing).toContain('Onduleurs monophasés homologués STEG');
    expect(missing).not.toContain('Modules photovoltaïques');
    expect(missing).toEqual([
      'Onduleurs monophasés homologués STEG',
      'Parafoudres DC',
      'Câbles AC',
      'Câbles de terre',
    ]);
  });
});
