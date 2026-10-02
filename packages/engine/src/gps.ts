/**
 * The project's GPS point (pv_dossier_input_schema.json GpsPoint) is stored once, as decimal
 * degrees, and every place that prints coordinates in the dossier (cover page, situation plan,
 * production simulation) MUST format from this single value via formatGpsPointDms — never
 * store or type a second, independently-entered coordinate. Spec §4: this is what prevents the
 * cover/situation-plan/PVsyst coordinate mismatch found in the reference dossier.
 */

export interface GpsPoint {
  lat: number;
  lon: number;
}

/** Formats one decimal-degree axis value as degrees-minutes-seconds with its hemisphere letter. */
export function formatDms(decimalDegrees: number, axis: 'lat' | 'lon'): string {
  const isNegative = decimalDegrees < 0;
  const absolute = Math.abs(decimalDegrees);

  const degrees = Math.floor(absolute);
  const minutesFull = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;

  const hemisphere = axis === 'lat' ? (isNegative ? 'S' : 'N') : isNegative ? 'W' : 'E';

  const secondsFormatted = seconds.toFixed(1);
  return `${degrees}°${minutes}'${secondsFormatted}"${hemisphere}`;
}

/** Formats a full GPS point as "lat lon" in DMS, the single string used everywhere in the dossier. */
export function formatGpsPointDms(point: GpsPoint): string {
  return `${formatDms(point.lat, 'lat')} ${formatDms(point.lon, 'lon')}`;
}
