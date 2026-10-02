import { describe, it, expect } from 'vitest';
import {
  nsMax,
  nsOptMax,
  nsMin,
  npMax,
  npOpt,
  totalDcPowerW,
  totalModuleCount,
  powerRatio,
} from '../src/string-sizing';
import type { PvModuleInput, InverterInput, InverterArrayEntry } from '../src/types';

const module: PvModuleInput = {
  pmaxW: 620,
  vmpV: 46.5,
  impA: 13.33,
  vocV: 55.9,
  iscA: 13.92,
  tempCoeffVocPct: -0.25,
  tempCoeffIscPct: 0.045,
  tempCoeffPmaxPct: -0.28,
  irmA: 25,
  maxSystemVoltageV: 1500,
  lengthMm: 2278,
  widthMm: 1134,
  weightKg: 33.5,
};

// Sofar-class single-phase inverter, 550V max, matching the corrected reference dossier
const inverter: InverterInput = {
  phases: 1,
  pacW: 3000,
  sacVA: 3000,
  vdcMaxV: 550,
  mpptMinV: 90,
  mpptMaxV: 550,
  startUpV: 100,
  mpptCount: 1,
  inputsPerMppt: 2,
  idcMaxPerMpptA: 16,
  iscMaxPerMpptA: 20,
  vacNomV: 230,
  iacMaxA: 16,
};

describe('nsMax', () => {
  it('NS_MAX = floor(vdcMaxV / VOC_TMIN)', () => {
    // VOC_TMIN at -10C = 60.79125; 550 / 60.79125 = 9.044...
    expect(nsMax(module, inverter, -10)).toBe(9);
  });
});

describe('nsOptMax', () => {
  it('NS_OPT_MAX = floor(mpptMaxV / VMP_TMIN), using Pmax coeff fallback', () => {
    // coeffVmp falls back to -0.28; VMP_TMIN at -10C = 46.5*(1+(-0.28/100)*-35) = 51.057
    // 550 / 51.057 = 10.77...
    expect(nsOptMax(module, inverter, -10)).toBe(10);
  });
});

describe('nsMin', () => {
  it('NS_MIN = ceil(max(mpptMinV, startUpV) / VMP_TMAX)', () => {
    // VMP_TMAX at 85C = 46.5*(1+(-0.28/100)*60) = 38.688
    // max(90, 100) = 100; 100 / 38.688 = 2.5848...
    expect(nsMin(module, inverter, 85)).toBe(3);
  });
});

describe('npMax', () => {
  it('NP_MAX = floor(iscMaxPerMpptA / ISC_TMAX)', () => {
    // ISC_TMAX at 85C = 13.92*(1+0.045/100*60) = 14.29584
    // 20 / 14.29584 = 1.399...
    expect(npMax(module, inverter, 85)).toBe(1);
  });
});

describe('npOpt', () => {
  it('NP_OPT = floor(idcMaxPerMpptA / IMP_TMAX)', () => {
    // IMP_TMAX at 85C = 13.33*(1+0.045/100*60) = 13.68991
    // 16 / 13.68991 = 1.1687...
    expect(npOpt(module, inverter, 85)).toBe(1);
  });
});

describe('totalDcPowerW and totalModuleCount (multi-inverter, multi-MPPT aggregation)', () => {
  const array: InverterArrayEntry[] = [
    {
      inverter,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
    {
      inverter,
      mppts: [
        { stringsInParallel: 1, modulesPerString: 5 },
        { stringsInParallel: 2, modulesPerString: 4 },
      ],
    },
  ];

  it('P_DC_W sums Ns*Np across every MPPT of every inverter, times pmaxW', () => {
    // inverter 1: 1*5 = 5 modules
    // inverter 2 mppt a: 1*5 = 5; mppt b: 2*4 = 8 => 13 modules
    // total modules = 18; 18 * 620 = 11160
    expect(totalDcPowerW(module, array)).toBe(11160);
  });

  it('MODULE_COUNT sums Ns*Np across every MPPT of every inverter', () => {
    expect(totalModuleCount(array)).toBe(18);
  });
});

describe('powerRatio', () => {
  it('POWER_RATIO = P_DC_W / sum(pacW) across all inverters', () => {
    const array: InverterArrayEntry[] = [
      { inverter, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
    ];
    // P_DC_W = 5 * 620 = 3100; sum(pacW) = 3000; ratio = 1.0333...
    expect(powerRatio(module, array)).toBeCloseTo(1.03333, 4);
  });
});
