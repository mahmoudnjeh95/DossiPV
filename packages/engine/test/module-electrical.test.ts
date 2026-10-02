import { describe, it, expect } from 'vitest';
import {
  resolveVmpTempCoeff,
  vocAtTmin,
  vmpAtTmin,
  vmpAtTmax,
  iscAtTmax,
  impAtTmax,
} from '../src/module-electrical';
import type { PvModuleInput } from '../src/types';

// LONGi LR7-72HGD-620M, the module actually used in the reference dossier.
const moduleWithVmpCoeff: PvModuleInput = {
  pmaxW: 620,
  vmpV: 46.5,
  impA: 13.33,
  vocV: 55.9,
  iscA: 13.92,
  tempCoeffVocPct: -0.25,
  tempCoeffIscPct: 0.045,
  tempCoeffPmaxPct: -0.28,
  tempCoeffVmpPct: -0.27,
  irmA: 25,
  maxSystemVoltageV: 1500,
  lengthMm: 2278,
  widthMm: 1134,
  weightKg: 33.5,
};

const moduleWithoutVmpCoeff: PvModuleInput = {
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

describe('resolveVmpTempCoeff', () => {
  it('uses tempCoeffVmpPct when present', () => {
    expect(resolveVmpTempCoeff(moduleWithVmpCoeff)).toBe(-0.27);
  });

  it('falls back to tempCoeffPmaxPct when tempCoeffVmpPct is absent (never tempCoeffVocPct)', () => {
    expect(resolveVmpTempCoeff(moduleWithoutVmpCoeff)).toBe(-0.28);
  });
});

describe('vocAtTmin', () => {
  it('computes Voc at Tmin per VOC_TMIN = vocV * (1 + tempCoeffVocPct/100 * (tMinC - 25))', () => {
    // -10 - 25 = -35; -0.25/100 * -35 = 0.0875; 55.9 * 1.0875 = 60.79125
    expect(vocAtTmin(moduleWithVmpCoeff, -10)).toBeCloseTo(60.79125, 5);
  });
});

describe('vmpAtTmin', () => {
  it('computes Vmp at Tmin using the resolved Vmp coefficient', () => {
    // -10 - 25 = -35; -0.27/100 * -35 = 0.0945; 46.5 * 1.0945 = 50.89425
    expect(vmpAtTmin(moduleWithVmpCoeff, -10)).toBeCloseTo(50.89425, 5);
  });

  it('falls back to tempCoeffPmaxPct, not tempCoeffVocPct, when module has no tempCoeffVmpPct', () => {
    // -0.28/100 * -35 = 0.098; 46.5 * 1.098 = 51.057
    expect(vmpAtTmin(moduleWithoutVmpCoeff, -10)).toBeCloseTo(51.057, 5);
  });
});

describe('vmpAtTmax', () => {
  it('computes Vmp at Tmax using the resolved Vmp coefficient', () => {
    // 85 - 25 = 60; -0.27/100 * 60 = -0.162; 46.5 * 0.838 = 38.967
    expect(vmpAtTmax(moduleWithVmpCoeff, 85)).toBeCloseTo(38.967, 5);
  });
});

describe('iscAtTmax', () => {
  it('computes Isc at Tmax with no bifacial gain', () => {
    // 85 - 25 = 60; 0.045/100 * 60 = 0.027; 13.92 * 1.027 = 14.29584
    expect(iscAtTmax(moduleWithVmpCoeff, 85)).toBeCloseTo(14.29584, 5);
  });

  it('applies bifacialGainPct when present', () => {
    const bifacialModule: PvModuleInput = {
      ...moduleWithVmpCoeff,
      bifacial: true,
      bifacialGainPct: 10,
    };
    // 14.29584 * 1.10 = 15.725424
    expect(iscAtTmax(bifacialModule, 85)).toBeCloseTo(15.725424, 5);
  });
});

describe('impAtTmax', () => {
  it('matches the reference dossier\'s corrected Imp at 85°C (13.92A dossier example used Isc coeff on Imp)', () => {
    // 13.33 * 1.027 = 13.68991
    expect(impAtTmax(moduleWithVmpCoeff, 85)).toBeCloseTo(13.68991, 5);
  });
});
