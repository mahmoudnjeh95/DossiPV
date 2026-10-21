import type { GpsPoint } from './gps';

const EARTH_RADIUS_M = 6_371_000;
/** Cables are not laid in a straight line: 20 % extra on the ground distance. */
const ROUTING_FACTOR = 1.2;
/** Vertical run per storey (floor-to-floor height). */
const STOREY_HEIGHT_M = 3.5;

/** Great-circle distance in metres (haversine). */
export function groundDistanceM(a: GpsPoint, b: GpsPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * DC run (PV field → technical room) and AC run (technical room → STEG meter) lengths from the
 * three placed points: ground distance × 1.2, plus the vertical run down `floors` + 1 storeys
 * for the DC cable. Rounded up to whole metres, at least 1.
 */
export function computeRunLengthsM(
  points: { field: GpsPoint; technicalRoom: GpsPoint; meter: GpsPoint },
  floors: number,
): { dcLengthM: number; acLengthM: number } {
  const dc = groundDistanceM(points.field, points.technicalRoom) * ROUTING_FACTOR + (floors + 1) * STOREY_HEIGHT_M;
  const ac = groundDistanceM(points.technicalRoom, points.meter) * ROUTING_FACTOR;
  return { dcLengthM: Math.max(1, Math.ceil(dc)), acLengthM: Math.max(1, Math.ceil(ac)) };
}
