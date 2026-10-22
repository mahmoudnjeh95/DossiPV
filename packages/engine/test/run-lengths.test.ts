import { describe, it, expect } from 'vitest';
import { groundDistanceM, computeRunLengthsM, formatRunLengthFormula } from '../src/run-lengths';

const LAT = 34.4;
const LON = 10.1;
const dLon10m = 10 / (111_320 * Math.cos((LAT * Math.PI) / 180));
const origin = { lat: LAT, lon: LON };
const tenEast = { lat: LAT, lon: LON + dLon10m };
const twentyEast = { lat: LAT, lon: LON + 2 * dLon10m };

describe('groundDistanceM', () => {
  it('measures 10 m east-west at Tunisian latitude', () => {
    expect(groundDistanceM(origin, tenEast)).toBeCloseTo(10, 1);
  });
});

describe('computeRunLengthsM', () => {
  it('adds the roof drop to the DC run and rounds up', () => {
    expect(computeRunLengthsM({ field: origin, technicalRoom: tenEast, meter: twentyEast }, 0)).toEqual({
      dcLengthM: 16,
      acLengthM: 12,
    });
  });

  it('adds 3.5 m per storey', () => {
    expect(computeRunLengthsM({ field: origin, technicalRoom: tenEast, meter: twentyEast }, 1).dcLengthM).toBe(19);
  });

  it('keeps at least one metre on each run', () => {
    expect(computeRunLengthsM({ field: origin, technicalRoom: origin, meter: origin }, 0)).toEqual({
      dcLengthM: 4,
      acLengthM: 1,
    });
  });
});

describe('formatRunLengthFormula', () => {
  // 15 × 1,2 + 2 × 3,5 = 25 exactly: the brief's "= 26 m" for these inputs would print a false
  // sum, so the pinned case uses the length the formula really gives.
  it('writes the DC formula with the storeys, in French decimals', () => {
    expect(formatRunLengthFormula(15, 25, 1, 'DC')).toBe('15 m au sol × 1,2 + (1 + 1) niveau(x) × 3,5 m = 25 m');
  });

  it('prints the ground distance to one decimal and the rounded-up length', () => {
    expect(formatRunLengthFormula(15.5, 26, 1, 'DC')).toBe('15,5 m au sol × 1,2 + (1 + 1) niveau(x) × 3,5 m = 26 m');
  });

  it('writes the AC formula without storeys, even when the floors are unknown', () => {
    expect(formatRunLengthFormula(20, 24, null, 'AC')).toBe('20 m au sol × 1,2 = 24 m');
  });

  it('matches computeRunLengthsM for the same points', () => {
    const lengths = computeRunLengthsM({ field: origin, technicalRoom: tenEast, meter: twentyEast }, 2);
    const ground = groundDistanceM(origin, tenEast);
    expect(formatRunLengthFormula(ground, lengths.dcLengthM, 2, 'DC')).toMatch(/= 23 m$/);
    expect(formatRunLengthFormula(groundDistanceM(tenEast, twentyEast), lengths.acLengthM, 2, 'AC')).toMatch(/= 12 m$/);
  });

  it('prints no formula when the run length was edited', () => {
    expect(formatRunLengthFormula(15, 40, 1, 'DC')).toBeNull();
    expect(formatRunLengthFormula(20, 30, 1, 'AC')).toBeNull();
  });

  it('prints no DC formula when the number of storeys is unknown', () => {
    expect(formatRunLengthFormula(15, 25, null, 'DC')).toBeNull();
  });
});
