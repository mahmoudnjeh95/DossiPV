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

/**
 * Formats one decimal-degree axis value as degrees-minutes-seconds with its hemisphere letter.
 *
 * Seconds are rounded to 1 decimal place as part of deriving degrees/minutes/seconds, not as a
 * display-only afterthought: computing seconds from the unrounded fractional minute and only
 * THEN calling seconds.toFixed(1) can produce "60.0" (e.g. 36.4 deg naively gives
 * 36°23'60.0" instead of 36°24'0.0"), because floating point pushes minutesFull/seconds just
 * under their next whole unit before the display rounding pushes them back over it, with
 * nothing to carry that rollover into minutes (or minutes into degrees). To fix this, the total
 * seconds-in-the-last-minute value is rounded to 1 decimal first, then explicitly carried into
 * minutes and, if that carry fills the minute, into degrees — so the displayed fields are always
 * mutually consistent.
 */
export function formatDms(decimalDegrees: number, axis: 'lat' | 'lon'): string {
  const isNegative = decimalDegrees < 0;
  const absolute = Math.abs(decimalDegrees);

  let degrees = Math.floor(absolute);
  const minutesFull = (absolute - degrees) * 60;
  let minutes = Math.floor(minutesFull);
  let seconds = Math.round((minutesFull - minutes) * 60 * 10) / 10;

  if (seconds >= 60) {
    seconds -= 60;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes -= 60;
    degrees += 1;
  }

  const hemisphere = axis === 'lat' ? (isNegative ? 'S' : 'N') : isNegative ? 'W' : 'E';

  const secondsFormatted = seconds.toFixed(1);
  return `${degrees}°${minutes}'${secondsFormatted}"${hemisphere}`;
}

/** Formats a full GPS point as "lat lon" in DMS, the single string used everywhere in the dossier. */
export function formatGpsPointDms(point: GpsPoint): string {
  return `${formatDms(point.lat, 'lat')} ${formatDms(point.lon, 'lon')}`;
}
