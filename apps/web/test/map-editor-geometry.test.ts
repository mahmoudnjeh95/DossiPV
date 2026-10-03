import { describe, it, expect } from 'vitest';
import { computePolygonCentroid, computePolygonAreaM2 } from '../app/(app)/projects/[id]/map/map-editor';

describe('computePolygonCentroid', () => {
  it('returns the arithmetic mean of the polygon vertices', () => {
    const centroid = computePolygonCentroid([
      { lat: 36.800, lon: 10.100 },
      { lat: 36.802, lon: 10.100 },
      { lat: 36.802, lon: 10.102 },
      { lat: 36.800, lon: 10.102 },
    ]);
    expect(centroid.lat).toBeCloseTo(36.801, 5);
    expect(centroid.lon).toBeCloseTo(10.101, 5);
  });
});

describe('computePolygonAreaM2', () => {
  it('computes the shoelace-formula area of a simple rectangle in square meters', () => {
    // Roughly a 20m x 20m square near the equator-ish latitude used elsewhere in this plan's tests.
    const area = computePolygonAreaM2([
      { lat: 36.80000, lon: 10.10000 },
      { lat: 36.80018, lon: 10.10000 },
      { lat: 36.80018, lon: 10.10022 },
      { lat: 36.80000, lon: 10.10022 },
    ]);
    expect(area).toBeGreaterThan(300);
    expect(area).toBeLessThan(500);
  });

  it('returns 0 for a degenerate polygon with fewer than 3 points', () => {
    expect(computePolygonAreaM2([{ lat: 36.8, lon: 10.1 }])).toBe(0);
    expect(computePolygonAreaM2([])).toBe(0);
  });
});
