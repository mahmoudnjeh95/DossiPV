import { describe, it, expect } from 'vitest';
import { fitSiteImage, parseSiteImagePoints, photoPixels, siteImageFitIssue, type SitePointKind } from '../src/site-image';
import type { GpsPoint } from '../src/gps';

const map: Record<SitePointKind, GpsPoint | null> = {
  field: { lat: 34.77343, lon: 10.78248 },
  technicalRoom: { lat: 34.7736, lon: 10.7826 },
  meter: { lat: 34.77327, lon: 10.78234 },
  earthPit: { lat: 34.77365, lon: 10.78251 },
};

/** Where a north-up capture at this (fractional) zoom and origin shows each map point. */
function capture(zoom: number, originX: number, originY: number): Record<SitePointKind, { x: number; y: number } | null> {
  const project = (p: GpsPoint | null): { x: number; y: number } | null => {
    if (!p) return null;
    const scale = 256 * 2 ** zoom;
    const latRad = (p.lat * Math.PI) / 180;
    return {
      x: ((p.lon + 180) / 360) * scale - originX,
      y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale - originY,
    };
  };
  return { field: project(map.field), technicalRoom: project(map.technicalRoom), meter: project(map.meter), earthPit: project(map.earthPit) };
}

const ZOOM = 20.4;
const ORIGIN = { x: 285_000_000 * 2 ** (ZOOM - 20) - 600, y: 207_000_000 * 2 ** (ZOOM - 20) };

describe('fitSiteImage', () => {
  it('finds the zoom, origin and scale of a north-up capture from the points placed on it', () => {
    const photo = capture(ZOOM, ORIGIN.x, ORIGIN.y);

    const fit = fitSiteImage(map, photo)!;

    expect(fit.zoom).toBeCloseTo(ZOOM, 6);
    expect(fit.originX).toBeCloseTo(ORIGIN.x, 1);
    expect(fit.originY).toBeCloseTo(ORIGIN.y, 1);
    expect(fit.metersPerPixel).toBeCloseTo((156543.03392 * Math.cos((34.7735 * Math.PI) / 180)) / 2 ** ZOOM, 4);
    for (const kind of ['field', 'technicalRoom', 'meter', 'earthPit'] as const) expect(fit.mismatchM[kind]).toBeLessThan(0.01);
    expect(siteImageFitIssue(fit)).toBeNull();
  });

  it('names a point placed away from where the map has it', () => {
    const photo = capture(ZOOM, ORIGIN.x, ORIGIN.y);
    const metresPerPx = (156543.03392 * Math.cos((34.7735 * Math.PI) / 180)) / 2 ** ZOOM;
    photo.meter = { x: photo.meter!.x + 12 / metresPerPx, y: photo.meter!.y };

    const fit = fitSiteImage(map, photo)!;

    expect(fit.mismatchM.meter).toBeGreaterThan(5);
    expect(siteImageFitIssue(fit)).toEqual({ kind: 'mismatch', points: ['meter'] });
  });

  it('only matches the points placed on both', () => {
    const photo = capture(ZOOM, ORIGIN.x, ORIGIN.y);

    const fit = fitSiteImage({ ...map, earthPit: null }, photo)!;

    expect(Object.keys(fit.mismatchM).sort()).toEqual(['field', 'meter', 'technicalRoom']);
  });

  it('cannot measure the photo by fewer than two points, or by points a metre apart', () => {
    const photo = capture(ZOOM, ORIGIN.x, ORIGIN.y);
    expect(fitSiteImage(map, { field: photo.field })).toBeNull();
    const close = { ...map, technicalRoom: { lat: map.field!.lat + 0.000005, lon: map.field!.lon } };
    expect(fitSiteImage({ ...close, meter: null, earthPit: null }, capture(ZOOM, ORIGIN.x, ORIGIN.y))).toBeNull();
  });

  it('refuses a scale no roof capture has', () => {
    const fit = fitSiteImage(map, capture(12, 0, 0))!;
    expect(fit.metersPerPixel).toBeGreaterThan(1);
    expect(siteImageFitIssue(fit)).toEqual({ kind: 'scale' });
  });
});

describe('parseSiteImagePoints', () => {
  const stored = {
    field: { x: 0.5, y: 0.5 },
    technicalRoom: { x: 0.6, y: 0.2 },
    meter: { x: 0.1, y: 0.9 },
    earthPit: null,
    roofOutline: [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.7, y: 0.7 }],
  };

  it('reads stored points, a missing point or roof as null', () => {
    expect(parseSiteImagePoints(stored)).toEqual(stored);
    expect(parseSiteImagePoints({ field: { x: 0, y: 1 } })).toEqual({ field: { x: 0, y: 1 }, technicalRoom: null, meter: null, earthPit: null, roofOutline: null });
  });

  it.each([
    ['null', null],
    ['a point off the photo', { ...stored, meter: { x: 1.2, y: 0.5 } }],
    ['a string coordinate', { ...stored, field: { x: '0.5', y: 0.5 } }],
    ['a two-corner roof', { ...stored, roofOutline: stored.roofOutline.slice(0, 2) }],
    ['a roof corner off the photo', { ...stored, roofOutline: [...stored.roofOutline, { x: -0.1, y: 0.5 }] }],
  ])('is null for %s', (_label, value) => {
    expect(parseSiteImagePoints(value)).toBeNull();
  });
});

describe('photoPixels', () => {
  it('scales the fractions to the image size', () => {
    const pixels = photoPixels({ field: { x: 0.5, y: 0.25 }, technicalRoom: null, meter: null, earthPit: null, roofOutline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }, 1000, 800);
    expect(pixels.field).toEqual({ x: 500, y: 200 });
    expect(pixels.technicalRoom).toBeNull();
    expect(pixels.roofOutline).toEqual([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }]);
  });
});
