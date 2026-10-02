import { describe, it, expect } from 'vitest';
import {
  resolveStabilityCoefficients,
  MissingStabilityCoefficientsError,
  totalWeightN,
  stabilityLhs,
  stabilityRhs,
} from '../src/structure';

describe('resolveStabilityCoefficients', () => {
  it('returns schema defaults when wind/tilt match 120 km/h, 30deg and no coefficients given', () => {
    const result = resolveStabilityCoefficients({ windSpeedKmh: 120, tiltDeg: 30 });
    expect(result).toEqual({
      liftCoeffNPerM2: 339,
      dragCoeffNPerM2: 196,
      usedDefault: true,
    });
  });

  it('returns explicitly supplied coefficients regardless of wind/tilt', () => {
    const result = resolveStabilityCoefficients({
      windSpeedKmh: 100,
      tiltDeg: 15,
      liftCoeffNPerM2: 250,
      dragCoeffNPerM2: 150,
    });
    expect(result).toEqual({
      liftCoeffNPerM2: 250,
      dragCoeffNPerM2: 150,
      usedDefault: false,
    });
  });

  it('throws MissingStabilityCoefficientsError when wind speed differs from default and no coefficients are supplied', () => {
    expect(() => resolveStabilityCoefficients({ windSpeedKmh: 100, tiltDeg: 30 })).toThrow(
      MissingStabilityCoefficientsError,
    );
  });

  it('throws MissingStabilityCoefficientsError when tilt differs from default and no coefficients are supplied', () => {
    expect(() => resolveStabilityCoefficients({ windSpeedKmh: 120, tiltDeg: 20 })).toThrow(
      MissingStabilityCoefficientsError,
    );
  });
});

describe('totalWeightN', () => {
  it('F_WEIGHT_N = frameCount*ballastPerFrame*ballastMassKg*9.81 + moduleCount*moduleWeightKg*9.81 + structureWeightN', () => {
    // ballast: 5 frames * 2 * 75kg * 9.81 = 7357.5
    // modules: 5 * 33.5 * 9.81 = 1643.175 (corrects the reference dossier's 1395N error)
    // structure: 275
    // total = 7357.5 + 1643.175 + 275 = 9275.675
    const result = totalWeightN({
      frameCount: 5,
      ballastPerFrame: 2,
      ballastMassKg: 75,
      moduleCount: 5,
      moduleWeightKg: 33.5,
      structureWeightN: 275,
    });
    expect(result).toBeCloseTo(9275.675, 3);
  });
});

describe('stabilityLhs and stabilityRhs', () => {
  it('STABILITY_LHS = (F_WEIGHT_N - liftCoeff*moduleAreaM2) * depthDM', () => {
    // (9275.675 - 339 * 12) * 1.5 = (9275.675 - 4068) * 1.5 = 7811.5125
    const result = stabilityLhs(9275.675, 339, 12, 1.5);
    expect(result).toBeCloseTo(7811.5125, 3);
  });

  it('STABILITY_RHS = 2 * dragCoeff * moduleAreaM2 * heightHM', () => {
    // 2 * 196 * 12 * 1 = 4704
    const result = stabilityRhs(196, 12, 1);
    expect(result).toBe(4704);
  });

  it('a stable structure has LHS > RHS', () => {
    const lhs = stabilityLhs(9275.675, 339, 12, 1.5);
    const rhs = stabilityRhs(196, 12, 1);
    expect(lhs).toBeGreaterThan(rhs);
  });
});
