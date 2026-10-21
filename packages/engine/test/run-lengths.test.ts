import { describe, it, expect } from 'vitest';
import { groundDistanceM, computeRunLengthsM } from '../src/run-lengths';

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
