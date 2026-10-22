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

/** One run's length from its ground distance; `floors` adds the vertical drop (DC only). */
function runLengthFromGroundM(groundM: number, floors: number | null): number {
  const vertical = floors === null ? 0 : (floors + 1) * STOREY_HEIGHT_M;
  return Math.max(1, Math.ceil(groundM * ROUTING_FACTOR + vertical));
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
  return {
    dcLengthM: runLengthFromGroundM(groundDistanceM(points.field, points.technicalRoom), floors),
    acLengthM: runLengthFromGroundM(groundDistanceM(points.technicalRoom, points.meter), null),
  };
}

const frenchNumber = (value: number, maxDecimals: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxDecimals, useGrouping: false }).format(value);

/**
 * The calculation behind a run length, in French, for the plans and notes. Null when it would not
 * give back `lengthM` — the installer typed another length — or, for DC, when the storeys are
 * unknown: the dossier then states the length as entered, never a formula with another result.
 */
export function formatRunLengthFormula(groundM: number, lengthM: number, floors: number | null, kind: 'DC' | 'AC'): string | null {
  if (kind === 'DC' && floors === null) return null;
  if (runLengthFromGroundM(groundM, kind === 'DC' ? floors : null) !== lengthM) return null;
  const ground = `${frenchNumber(groundM, 1)} m au sol × ${frenchNumber(ROUTING_FACTOR, 1)}`;
  const vertical = kind === 'DC' ? ` + (${floors} + 1) niveau(x) × ${frenchNumber(STOREY_HEIGHT_M, 1)} m` : '';
  return `${ground}${vertical} = ${lengthM} m`;
}
