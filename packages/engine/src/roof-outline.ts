import type { GpsPoint } from './gps';

/** A hand-drawn roof never needs more corners; a longer list is a client bug, not a roof. */
export const MAX_ROOF_OUTLINE_POINTS = 100;

const METERS_PER_DEGREE_LAT = 111_320;

/** The outline in local metres (east, north) around its first corner: exact enough for a roof. */
function toLocalMetres(points: GpsPoint[]): { x: number; y: number }[] {
  const origin = points[0]!;
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return points.map((p) => ({ x: (p.lon - origin.lon) * metersPerDegreeLon, y: (p.lat - origin.lat) * METERS_PER_DEGREE_LAT }));
}

/** The roof outline's surface in m² (shoelace formula); 0 below three corners. */
export function polygonAreaM2(points: GpsPoint[]): number {
  if (points.length < 3) return 0;
  const local = toLocalMetres(points);
  let twiceArea = 0;
  for (let i = 0; i < local.length; i += 1) {
    const a = local[i]!;
    const b = local[(i + 1) % local.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) / 2;
}

/** Strict crossing of segments ab and cd (touching ends do not count). */
function segmentsCross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): boolean {
  const side = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when no two non-adjacent edges of the closed outline cross each other. */
export function isSimplePolygon(points: GpsPoint[]): boolean {
  if (points.length < 3) return false;
  const local = toLocalMetres(points);
  const n = local.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // Adjacent edges share a corner, including the closing edge with the first one.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(local[i]!, local[(i + 1) % n]!, local[j]!, local[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

/** The outline's area centroid; the corners' average when the outline has no area. */
export function polygonCentroid(points: GpsPoint[]): GpsPoint {
  const average = { lat: points.reduce((s, p) => s + p.lat, 0) / points.length, lon: points.reduce((s, p) => s + p.lon, 0) / points.length };
  let twiceArea = 0;
  let lat = 0;
  let lon = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    // In degrees around the average: the factor cos(lat) cancels out of the centroid.
    const ax = a.lon - average.lon;
    const ay = a.lat - average.lat;
    const bx = b.lon - average.lon;
    const by = b.lat - average.lat;
    const cross = ax * by - bx * ay;
    twiceArea += cross;
    lon += (ax + bx) * cross;
    lat += (ay + by) * cross;
  }
  if (Math.abs(twiceArea) < 1e-18) return average;
  return { lat: average.lat + lat / (3 * twiceArea), lon: average.lon + lon / (3 * twiceArea) };
}

/**
 * The stored roof outline (ProjectSite.roofOutline, JSON) as GPS corners, or null when it is
 * absent or not a list of at least three finite {lat, lon} corners.
 */
export function parseRoofOutline(value: unknown): GpsPoint[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_ROOF_OUTLINE_POINTS) return null;
  const points: GpsPoint[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const { lat, lon } = item as Record<string, unknown>;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    points.push({ lat, lon });
  }
  return points;
}
