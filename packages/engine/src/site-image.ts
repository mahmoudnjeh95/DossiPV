import type { GpsPoint } from './gps';

/** Where the installer's own satellite photo lies on the map, edges in decimal degrees. */
export interface SiteImageBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** A capture wider than this (≈ 5 km) is a misplaced overlay, not a roof-scale photo. */
const MAX_SPAN_DEG = 0.05;

/**
 * The stored bounds (ProjectSite.siteImageBounds, JSON), or null when absent or not a real
 * rectangle: finite edges, north above south, east of west, at most MAX_SPAN_DEG across.
 */
export function parseSiteImageBounds(value: unknown): SiteImageBounds | null {
  if (typeof value !== 'object' || value === null) return null;
  const { north, south, east, west } = value as Record<string, unknown>;
  if (![north, south, east, west].every((edge) => typeof edge === 'number' && Number.isFinite(edge))) return null;
  const bounds = { north, south, east, west } as SiteImageBounds;
  if (bounds.north > 85 || bounds.south < -85 || bounds.west < -180 || bounds.east > 180) return null;
  if (bounds.north <= bounds.south || bounds.east <= bounds.west) return null;
  if (bounds.north - bounds.south > MAX_SPAN_DEG || bounds.east - bounds.west > MAX_SPAN_DEG) return null;
  return bounds;
}

export function isInsideBounds(bounds: SiteImageBounds, point: GpsPoint): boolean {
  return point.lat <= bounds.north && point.lat >= bounds.south && point.lon <= bounds.east && point.lon >= bounds.west;
}
