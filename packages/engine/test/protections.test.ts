import { describe, it, expect } from 'vitest';
import {
  ncMaxNoFuse,
  dcFuseRequired,
  stringVocTmin,
  stringVmpStc,
  iscFieldDesign,
  dcFuseCheckInput,
} from '../src/protections';
import type { PvModuleInput } from '../src/types';

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

describe('ncMaxNoFuse', () => {
  it('NC_MAX_NO_FUSE = floor(1 + irmA / iscA)', () => {
    // 1 + 25/13.92 = 2.7959...; floor = 2
    expect(ncMaxNoFuse(module)).toBe(2);
  });
});

describe('dcFuseRequired', () => {
  it('is false when Np equals NC_MAX_NO_FUSE exactly (boundary, strict >)', () => {
    expect(dcFuseRequired(module, 2)).toBe(false);
  });

  it('is true when Np exceeds NC_MAX_NO_FUSE', () => {
    expect(dcFuseRequired(module, 3)).toBe(true);
  });

  it('is false when Np is below NC_MAX_NO_FUSE', () => {
    expect(dcFuseRequired(module, 1)).toBe(false);
  });
});

describe('stringVocTmin', () => {
  it('STRING_VOC_TMIN = Ns * VOC_TMIN', () => {
    // VOC_TMIN at -10C = 60.79125 (floating-point precision); Ns=5 => 303.95625
    // Note: brief comment had 60.80625 but actual calculation with -0.25% coeff and -35C delta gives 60.79125
    expect(stringVocTmin(module, 5, -10)).toBeCloseTo(303.95625, 5);
  });
});

describe('stringVmpStc', () => {
  it('STRING_VMP_STC = Ns * vmpV', () => {
    expect(stringVmpStc(module, 5)).toBe(232.5);
  });
});

describe('iscFieldDesign', () => {
  it('ISC_FIELD_DESIGN = 1.25 * iscA * Np, with no bifacial gain', () => {
    // 1.25 * 13.92 * 2 = 34.8
    expect(iscFieldDesign(module, 2)).toBeCloseTo(34.8, 5);
  });

  it('applies bifacialGainPct when present', () => {
    const bifacialModule: PvModuleInput = { ...module, bifacial: true, bifacialGainPct: 10 };
    // 34.8 * 1.10 = 38.28
    expect(iscFieldDesign(bifacialModule, 2)).toBeCloseTo(38.28, 5);
  });
});

describe('dcFuseCheckInput', () => {
  it('gives C08 the fuse, its rating window [1.1 x 1.25 x iscA, irmA] and the string Voc at Tmin', () => {
    expect(dcFuseCheckInput(module, 5, 3, -10, { ratedCurrentA: 20, ratedVoltageV: 1000 })).toEqual({
      fuseRequired: true,
      fuseSet: true,
      fuseRatedCurrentA: 20,
      fuseRatedVoltageV: 1000,
      // 1.1 * 1.25 * 13.92 = 19.14
      lowerBoundA: expect.closeTo(19.14, 5) as number,
      upperBoundA: 25,
      stringVocTmin: expect.closeTo(303.95625, 5) as number,
    });
  });

  it('reports no fuse set when none is fitted', () => {
    const input = dcFuseCheckInput(module, 5, 1, -10, null);
    expect(input).toMatchObject({ fuseRequired: false, fuseSet: false, fuseRatedCurrentA: null, fuseRatedVoltageV: null });
  });
});
