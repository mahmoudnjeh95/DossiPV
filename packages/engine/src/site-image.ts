import type { GpsPoint } from './gps';
import { MAX_ROOF_OUTLINE_POINTS } from './roof-outline';

/** The points the installer places on the map, and again on their own satellite photo. */
export const SITE_POINT_KINDS = ['field', 'technicalRoom', 'meter', 'earthPit'] as const;
export type SitePointKind = (typeof SITE_POINT_KINDS)[number];

/** A spot on the photo as fractions of its width (x, from the left) and height (y, from the top). */
export interface PhotoPoint {
  x: number;
  y: number;
}

/**
 * Where the installer placed the points and drew the roof on their own satellite photo
 * (ProjectSite.siteImagePoints). Only the drawings of the dossier use them: every length is
 * measured on the map.
 */
export interface SiteImagePoints {
  field: PhotoPoint | null;
  technicalRoom: PhotoPoint | null;
  meter: PhotoPoint | null;
  earthPit: PhotoPoint | null;
  roofOutline: PhotoPoint[] | null;
}

function parsePhotoPoint(value: unknown): PhotoPoint | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return undefined;
  return { x, y };
}

/**
 * The stored photo points (JSON), or null when absent or malformed: every point null or on the
 * photo (fractions between 0 and 1), the roof null or 3 to MAX_ROOF_OUTLINE_POINTS corners.
 */
export function parseSiteImagePoints(value: unknown): SiteImagePoints | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const points: Partial<Record<SitePointKind, PhotoPoint | null>> = {};
  for (const kind of SITE_POINT_KINDS) {
    const point = parsePhotoPoint(record[kind]);
    if (point === undefined) return null;
    points[kind] = point;
  }
  let roofOutline: PhotoPoint[] | null = null;
  const roof = record['roofOutline'];
  if (roof !== null && roof !== undefined) {
    if (!Array.isArray(roof) || roof.length < 3 || roof.length > MAX_ROOF_OUTLINE_POINTS) return null;
    roofOutline = [];
    for (const corner of roof) {
      const point = parsePhotoPoint(corner);
      if (!point) return null;
      roofOutline.push(point);
    }
  }
  return { field: points.field!, technicalRoom: points.technicalRoom!, meter: points.meter!, earthPit: points.earthPit!, roofOutline };
}

const TILE_SIZE = 256;
const METRES_PER_WORLD_PX_Z0 = 156543.03392; // ground metres per Web-Mercator pixel at zoom 0, equator
/** Below this spread between the points, the photo's scale cannot be told reliably. */
const MIN_TIE_SPREAD_M = 3;
/** A point the photo puts further than this from where the map has it is misplaced on one of them. */
export const MAX_PHOTO_MISMATCH_M = 5;
/** A usable roof capture shows between 1 cm and 1 m of ground per pixel. */
const PHOTO_METRES_PER_PX = { min: 0.01, max: 1 };

/** Web-Mercator world pixel at zoom 0 (256 px tiles), like the map and a Google Maps capture. */
function worldPixel(point: GpsPoint): { x: number; y: number } {
  const latRad = (point.lat * Math.PI) / 180;
  return {
    x: ((point.lon + 180) / 360) * TILE_SIZE,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * TILE_SIZE,
  };
}

/** How the photo lies on the map, worked out from the points placed on both. */
export interface SiteImageFit {
  /**
   * The photo as a window onto the Web-Mercator world-pixel grid at a fractional zoom: a photo
   * pixel is the world pixel at `zoom` minus the origin (north up, like a Google Maps capture).
   */
  zoom: number;
  originX: number;
  originY: number;
  metersPerPixel: number;
  /** For each point placed on both: how far (ground metres) the photo puts it from the map. */
  mismatchM: Partial<Record<SitePointKind, number>>;
}

/**
 * The scale and offset that best carry the map points onto the photo points (least squares, no
 * rotation: a capture is north up). `photo` is in the photo's own pixels. Null below two points
 * placed on both, or when they are too close together to measure the photo by.
 */
export function fitSiteImage(map: Record<SitePointKind, GpsPoint | null>, photo: Partial<Record<SitePointKind, { x: number; y: number } | null>>): SiteImageFit | null {
  const ties = SITE_POINT_KINDS.flatMap((kind) => {
    const gps = map[kind];
    const pixel = photo[kind];
    return gps && pixel ? [{ kind, gps, world: worldPixel(gps), pixel }] : [];
  });
  if (ties.length < 2) return null;
  const n = ties.length;
  const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / n;
  const w = { x: mean(ties.map((t) => t.world.x)), y: mean(ties.map((t) => t.world.y)) };
  const p = { x: mean(ties.map((t) => t.pixel.x)), y: mean(ties.map((t) => t.pixel.y)) };
  let spread = 0;
  let covariance = 0;
  for (const t of ties) {
    const dx = t.world.x - w.x;
    const dy = t.world.y - w.y;
    spread += dx * dx + dy * dy;
    covariance += dx * (t.pixel.x - p.x) + dy * (t.pixel.y - p.y);
  }
  const latRad = (mean(ties.map((t) => t.gps.lat)) * Math.PI) / 180;
  const metresPerWorldPx = METRES_PER_WORLD_PX_Z0 * Math.cos(latRad);
  const maxTieDistanceM = Math.max(...ties.flatMap((a) => ties.map((b) => Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y)))) * metresPerWorldPx;
  if (maxTieDistanceM < MIN_TIE_SPREAD_M) return null;
  const scale = covariance / spread; // photo pixels per world pixel at zoom 0
  if (!(scale > 0)) return null;
  const offset = { x: p.x - scale * w.x, y: p.y - scale * w.y };
  const metersPerPixel = metresPerWorldPx / scale;
  const mismatchM: Partial<Record<SitePointKind, number>> = {};
  for (const t of ties) {
    mismatchM[t.kind] = Math.hypot(t.pixel.x - (scale * t.world.x + offset.x), t.pixel.y - (scale * t.world.y + offset.y)) * metersPerPixel;
  }
  return { zoom: Math.log2(scale), originX: -offset.x, originY: -offset.y, metersPerPixel, mismatchM };
}

export type SiteImageFitIssue = { kind: 'scale' } | { kind: 'mismatch'; points: SitePointKind[] };

/** Why a fit cannot be drawn on: an implausible scale, or points the photo puts away from the map. */
export function siteImageFitIssue(fit: SiteImageFit): SiteImageFitIssue | null {
  if (fit.metersPerPixel < PHOTO_METRES_PER_PX.min || fit.metersPerPixel > PHOTO_METRES_PER_PX.max) return { kind: 'scale' };
  const points = SITE_POINT_KINDS.filter((kind) => (fit.mismatchM[kind] ?? 0) > MAX_PHOTO_MISMATCH_M);
  return points.length > 0 ? { kind: 'mismatch', points } : null;
}

/** The photo points in the photo's own pixels, for an image `widthPx` × `heightPx`. */
export function photoPixels(points: SiteImagePoints, widthPx: number, heightPx: number): Record<SitePointKind, { x: number; y: number } | null> & { roofOutline: { x: number; y: number }[] | null } {
  const toPixel = (p: PhotoPoint | null): { x: number; y: number } | null => (p ? { x: p.x * widthPx, y: p.y * heightPx } : null);
  return {
    field: toPixel(points.field),
    technicalRoom: toPixel(points.technicalRoom),
    meter: toPixel(points.meter),
    earthPit: toPixel(points.earthPit),
    roofOutline: points.roofOutline ? points.roofOutline.map((p) => ({ x: p.x * widthPx, y: p.y * heightPx })) : null,
  };
}
