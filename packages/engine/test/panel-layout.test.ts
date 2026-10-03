import { describe, it, expect } from 'vitest';
import { computeRowSpacingM, computePanelLayout } from '../src/panel-layout';
import type { GpsPoint } from '../src/gps';

describe('computeRowSpacingM', () => {
  it('computes the standard worst-case-date row spacing for a known latitude/tilt', () => {
    // Latitude 34 deg, tilt 30 deg, module length 2m.
    // elevationDeg = 90 - |34 - (-23.45)| = 90 - 57.45 = 32.55
    // panelHeightM = 2 * sin(30deg) = 1.0
    // spacingM = 1.0 / tan(32.55deg) ≈ 1.0 / 0.6388 ≈ 1.5655
    const spacing = computeRowSpacingM(30, 2, 34);
    expect(spacing).toBeGreaterThan(1.5);
    expect(spacing).toBeLessThan(1.6);
  });

  it('requires more spacing at a higher latitude (lower winter sun angle)', () => {
    const spacingLowLat = computeRowSpacingM(30, 2, 30);
    const spacingHighLat = computeRowSpacingM(30, 2, 37);
    expect(spacingHighLat).toBeGreaterThan(spacingLowLat);
  });

  it('requires more spacing at a steeper tilt', () => {
    const spacingShallow = computeRowSpacingM(15, 2, 34);
    const spacingSteep = computeRowSpacingM(45, 2, 34);
    expect(spacingSteep).toBeGreaterThan(spacingShallow);
  });
});

describe('computePanelLayout', () => {
  // A roughly 20m x 10m rectangle, large enough for several rows.
  const largePolygon: GpsPoint[] = [
    { lat: 36.8000, lon: 10.1000 },
    { lat: 36.8000, lon: 10.1003 },
    { lat: 36.7999, lon: 10.1003 },
    { lat: 36.7999, lon: 10.1000 },
  ];

  it('places all requested modules when the polygon is large enough', () => {
    const result = computePanelLayout(largePolygon, 10, 2, 1, 30, 36.8);
    expect(result.fitsAllModules).toBe(true);
    expect(result.placedCount).toBe(10);
  });

  it('sets fitsAllModules to false and places fewer than requested when the polygon is too small', () => {
    const tinyPolygon: GpsPoint[] = [
      { lat: 36.80000, lon: 10.10000 },
      { lat: 36.80000, lon: 10.10002 },
      { lat: 36.79999, lon: 10.10002 },
      { lat: 36.79999, lon: 10.10000 },
    ];

    const result = computePanelLayout(tinyPolygon, 50, 2, 1, 30, 36.8);
    expect(result.fitsAllModules).toBe(false);
    expect(result.placedCount).toBeLessThan(50);
  });

  it('produces a partial last row when module count is not evenly divisible by row capacity', () => {
    // With a wide-enough polygon and narrow modules, one row should fit more than the
    // remainder, producing a shorter final row rather than dropping modules.
    const result = computePanelLayout(largePolygon, 7, 2, 1, 30, 36.8);
    expect(result.fitsAllModules).toBe(true);
    expect(result.placedCount).toBe(7);
    const totalPlacedAcrossRows = result.rows.reduce((sum, row) => sum + row.length, 0);
    expect(totalPlacedAcrossRows).toBe(7);
  });

  it('returns rows as arrays of lat/lon points with a rotation, not raw meter coordinates', () => {
    const result = computePanelLayout(largePolygon, 3, 2, 1, 30, 36.8);
    for (const row of result.rows) {
      for (const point of row) {
        expect(typeof point.lat).toBe('number');
        expect(typeof point.lon).toBe('number');
        expect(typeof point.rotationDeg).toBe('number');
      }
    }
  });
});
