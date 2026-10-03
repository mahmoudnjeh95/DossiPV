import type { GpsPoint } from './gps';

const SOLSTICE_DECLINATION_DEG = -23.45;
const METERS_PER_DEGREE_LAT = 111_320;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Minimum center-to-center row spacing (meters) that avoids one row shadowing the row behind
 * it at winter-solstice solar noon for the given latitude — the worst case of the year.
 */
export function computeRowSpacingM(tiltDeg: number, moduleLengthM: number, latitudeDeg: number): number {
  const elevationDeg = 90 - Math.abs(latitudeDeg - SOLSTICE_DECLINATION_DEG);
  const panelHeightM = moduleLengthM * Math.sin(toRad(tiltDeg));
  return panelHeightM / Math.tan(toRad(elevationDeg));
}

export interface PanelLayoutResult {
  rows: (GpsPoint & { rotationDeg: number })[][];
  placedCount: number;
  fitsAllModules: boolean;
}

interface LocalPoint {
  xM: number;
  yM: number;
}

function toLocalMeters(point: GpsPoint, originLat: number, originLon: number): LocalPoint {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(toRad(originLat));
  return {
    xM: (point.lon - originLon) * metersPerDegreeLon,
    yM: (point.lat - originLat) * METERS_PER_DEGREE_LAT,
  };
}

function toGpsPoint(local: LocalPoint, originLat: number, originLon: number): GpsPoint {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(toRad(originLat));
  return {
    lat: originLat + local.yM / METERS_PER_DEGREE_LAT,
    lon: originLon + local.xM / metersPerDegreeLon,
  };
}

export function computePanelLayout(
  polygon: GpsPoint[],
  moduleCount: number,
  moduleLengthM: number,
  moduleWidthM: number,
  tiltDeg: number,
  latitudeDeg: number,
): PanelLayoutResult {
  const originLat = polygon[0]!.lat;
  const originLon = polygon[0]!.lon;
  const localPoints = polygon.map((p) => toLocalMeters(p, originLat, originLon));

  const minX = Math.min(...localPoints.map((p) => p.xM));
  const maxX = Math.max(...localPoints.map((p) => p.xM));
  const minY = Math.min(...localPoints.map((p) => p.yM));
  const maxY = Math.max(...localPoints.map((p) => p.yM));

  const rowSpacingM = computeRowSpacingM(tiltDeg, moduleLengthM, latitudeDeg);
  const modulesPerRow = Math.max(1, Math.floor((maxX - minX) / moduleWidthM));

  const rows: (GpsPoint & { rotationDeg: number })[][] = [];
  let remaining = moduleCount;
  let currentY = maxY; // start from the northern edge

  while (remaining > 0 && currentY - rowSpacingM >= minY) {
    const countThisRow = Math.min(modulesPerRow, remaining);
    const row: (GpsPoint & { rotationDeg: number })[] = [];
    for (let i = 0; i < countThisRow; i++) {
      const xM = minX + i * moduleWidthM;
      const gps = toGpsPoint({ xM, yM: currentY }, originLat, originLon);
      row.push({ ...gps, rotationDeg: 0 });
    }
    rows.push(row);
    remaining -= countThisRow;
    currentY -= rowSpacingM;
  }

  const placedCount = moduleCount - remaining;
  return { rows, placedCount, fitsAllModules: placedCount === moduleCount };
}
