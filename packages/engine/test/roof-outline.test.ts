import { describe, it, expect } from 'vitest';
import { isSimplePolygon, parseRoofOutline, polygonAreaM2, polygonCentroid, MAX_ROOF_OUTLINE_POINTS } from '../src/roof-outline';

const LAT = 34.4;
const LON = 10.1;
const dLat = (m: number): number => m / 111_320;
const dLon = (m: number): number => m / (111_320 * Math.cos((LAT * Math.PI) / 180));
const at = (eastM: number, northM: number): { lat: number; lon: number } => ({ lat: LAT + dLat(northM), lon: LON + dLon(eastM) });

const square10 = [at(0, 0), at(10, 0), at(10, 10), at(0, 10)];

describe('polygonAreaM2', () => {
  it('measures a 10 m × 10 m roof as 100 m², in either winding', () => {
    expect(polygonAreaM2(square10)).toBeCloseTo(100, 1);
    expect(polygonAreaM2([...square10].reverse())).toBeCloseTo(100, 1);
  });

  it('measures an L-shaped roof', () => {
    const lShape = [at(0, 0), at(12, 0), at(12, 4), at(4, 4), at(4, 10), at(0, 10)];
    expect(polygonAreaM2(lShape)).toBeCloseTo(12 * 4 + 4 * 6, 1);
  });

  it('is 0 below three corners', () => {
    expect(polygonAreaM2(square10.slice(0, 2))).toBe(0);
  });
});

describe('isSimplePolygon', () => {
  it('accepts a square and an L shape', () => {
    expect(isSimplePolygon(square10)).toBe(true);
    expect(isSimplePolygon([at(0, 0), at(12, 0), at(12, 4), at(4, 4), at(4, 10), at(0, 10)])).toBe(true);
  });

  it('refuses a bow tie (corners clicked out of order)', () => {
    expect(isSimplePolygon([at(0, 0), at(10, 10), at(10, 0), at(0, 10)])).toBe(false);
  });

  it('refuses fewer than three corners', () => {
    expect(isSimplePolygon(square10.slice(0, 2))).toBe(false);
  });
});

describe('polygonCentroid', () => {
  it('is the middle of a square', () => {
    const centre = polygonCentroid(square10);
    expect(centre.lat).toBeCloseTo(at(5, 5).lat, 9);
    expect(centre.lon).toBeCloseTo(at(5, 5).lon, 9);
  });

  it('weights an L shape by its area, not by its corners', () => {
    // 12 × 2 strip plus a 2 × 10 column: the area centroid sits at the corner side.
    const lShape = [at(0, 0), at(12, 0), at(12, 2), at(2, 2), at(2, 10), at(0, 10)];
    const centre = polygonCentroid(lShape);
    // Strip 24 m² centred (6, 1), column 16 m² centred (1, 6): centroid (4, 3).
    expect(centre.lon).toBeCloseTo(at(4, 3).lon, 8);
    expect(centre.lat).toBeCloseTo(at(4, 3).lat, 8);
  });
});

describe('parseRoofOutline', () => {
  it('reads a stored outline', () => {
    expect(parseRoofOutline(square10)).toEqual(square10);
  });

  it.each([
    ['null', null],
    ['two corners', square10.slice(0, 2)],
    ['a string latitude', [{ lat: '34', lon: 10 }, ...square10]],
    ['a non-finite longitude', [...square10, { lat: 34, lon: Number.NaN }]],
    ['an object', { outline: square10 }],
    ['too many corners', Array.from({ length: MAX_ROOF_OUTLINE_POINTS + 1 }, (_, i) => at(i, i % 2))],
  ])('is null for %s', (_label, value) => {
    expect(parseRoofOutline(value)).toBeNull();
  });
});
